(function() {

  angular.module('mnQuery').factory('mnQueryService', getMnQueryService);

  getMnQueryService.$inject = ['$q', '$timeout', '$http', 'mnHelper'];

  function getMnQueryService($q, $timeout, $http, mnHelper) {

    var mnQueryService = {};

    //
    // remember which tab is selected for output style: JSON, table, or tree
    //

    mnQueryService.selectTab = function(newTab) {mnQueryService.outputTab = newTab;};
    mnQueryService.isSelected = function(checkTab) {return mnQueryService.outputTab === checkTab;};

    mnQueryService.outputTab = 1;     // remember selected output tab
    mnQueryService.limit = {max: 100};

    // access to our most recent query result, and functions to traverse the history
    // of different results

    mnQueryService.getResult = function() {return lastResult;};
    mnQueryService.getCurrentIndex = function() {return currentQueryIndex;};
    mnQueryService.clearHistory = clearHistory; 
    mnQueryService.hasPrevResult = hasPrevResult; 
    mnQueryService.hasNextResult = hasNextResult; 
    mnQueryService.prevResult = prevResult; 
    mnQueryService.nextResult = nextResult;

    //
    // keep track of the bucket and field names we have seen, for use in autocompletion
    //

    mnQueryService.autoCompleteTokens = {}; // keep a map, name and kind
    mnQueryService.autoCompleteArray = []; // array for use with Ace Editor  

    // execute queries, and keep track of when we are busy doing so

    mnQueryService.busyExecutingQuery = false;
    mnQueryService.executeQuery = executeQuery; 

    // update store the metadata about buckets

    mnQueryService.buckets = [];
    mnQueryService.busyGettingBuckets = false;  
    mnQueryService.updateBuckets = updateBuckets;             // get list of buckets
    mnQueryService.getSchemaForBucket = getSchemaForBucket;   // get schema
    mnQueryService.authenticateBuckets = authenticateBuckets; // check password    

    //
    // this structure holds the current query text, the current query result,
    // and defines the object for holding the query history
    //

    function QueryResult(status,elapsedTime,executionTime,resultCount,resultSize,result,data,query,requestID) {
      this.status = status;
      this.resultCount = resultCount;
      this.resultSize = resultSize;
      this.result = result;
      this.data = data;
      this.query = query;
      this.requestID = requestID;

      this.elapsedTime = truncateTime(elapsedTime);
      this.executionTime = truncateTime(executionTime);
    };


    // elapsed and execution time come back with ridiculous amounts of
    // precision, and some letters at the end indicating units.

    function truncateTime(timeStr)
    {
      var timeEx = /([0-9.]+)([a-z]+)/i; // number + time unit string

      if (timeStr && timeEx.test(timeStr)) {
        var parts = timeEx.exec(timeStr);
        var num = Number(parts[1]).toFixed(2); // truncate number part
        if (!isNaN(num))
          return(num + parts[2]);
      }

      return(timeStr); // couldn't match, just return orig value      
    }


    QueryResult.prototype.clone = function()
    {
      return new QueryResult(this.status,this.elapsedTime,this.executionTime,this.resultCount,
          this.resultSize,this.result,this.data,this.query,this.requestID);
    };
    QueryResult.prototype.copyIn = function(other)
    {
      this.status = other.status;
      this.elapsedTime = other.elapsedTime;
      this.executionTime = other.executionTime;
      this.resultCount = other.resultCount;
      this.resultSize = other.resultSize;
      this.result = other.result;
      this.data = other.data;
      this.query = other.query;
      this.requestID = other.requestID;
    };


    //
    // structures for remembering queries and results
    //

    var dummyResult = new QueryResult('-','-','-','-','-','',{},'');
    var lastResult = dummyResult.clone();
    var savedResultTemplate = dummyResult.clone();
    savedResultTemplate.status = "cached query";
    savedResultTemplate.result = '{"data_not_cached": "hit execute to rerun query"}';
    savedResultTemplate.data = {data_not_cached: "hit execute to rerun query"};


    var pastQueries = [];       // keep a history of past queries and their results 
    var currentQueryIndex = 0;  // where in the array are we? we start past the
    // end of the array, since there's no history yet

    // 
    // we want to store our state in the browser, if possible
    //

    function supportsHtml5Storage() {
      try {
        return 'localStorage' in window && window['localStorage'] !== null;
      } catch (e) {
        return false;
      }
    }

    var hasLocalStorage = supportsHtml5Storage();
    var localStorageKey = 'CouchbaseQueryWorkbenchState';

    function loadStateFromStorage() {
      // make sure we have local storage

      //console.log("Trying to load from storage...");

      if (hasLocalStorage && _.isString(localStorage[localStorageKey])) try {
        var savedState = JSON.parse(localStorage[localStorageKey]);
        //console.log("Got saved state: " + JSON.stringify(savedState));
        if (savedState.lastResult) {
          //console.log("Got last result: " + JSON.stringify(savedState.lastResult));
          lastResult.copyIn(savedState.lastResult);
          currentQueryIndex = savedState.currentQueryIndex;
          pastQueries = savedState.pastQueries;
          mnQueryService.outputTab = savedState.outputTab;
          mnQueryService.limit = savedState.limit;      
        }
        else
          console.log("No last result");
      } catch (err) {console.log("Error loading state: " + err);}
    }


    function saveStateToStorage() {
      // nop if we don't have local storage
      if (!hasLocalStorage)
        return;

      // create a structure to hold the current state. To save state we will only
      // save queries, and not their results (which might well exceed the 5MB
      // we have available

      var savedState = {};
      savedState.pastQueries = [];
      savedState.outputTab = mnQueryService.outputTab;
      savedState.limit = mnQueryService.limit;
      savedState.currentQueryIndex = currentQueryIndex;
      savedState.lastResult = savedResultTemplate.clone();
      savedState.lastResult.query = lastResult.query;
      _.forEach(pastQueries,function(queryRes,index) {
        var qcopy = savedResultTemplate.clone();
        qcopy.query = queryRes.query;
        savedState.pastQueries.push(qcopy);
      });

      localStorage[localStorageKey] = JSON.stringify(savedState);
      //
      //console.log("Saving state to storage: " + JSON.stringify(savedState));
    }

    //
    // functions for adding new tokens and refreshing the token array
    //

    function addToken(token, type) {
      // see if the token needs to be quoted
      if (token.indexOf(' ') >= 0 || token.indexOf('-') >= 0)
        mnQueryService.autoCompleteTokens['`' + token + '`'] = type;
      else
        mnQueryService.autoCompleteTokens[token] = type;
    };


    function refreshAutoCompleteArray() {
      mnQueryService.autoCompleteArray.length = 0;

      for (var key in mnQueryService.autoCompleteTokens) {
        mnQueryService.autoCompleteArray.push(
            {caption:key,snippet:key,meta:mnQueryService.autoCompleteTokens[key]});
      }
    };


    //
    // go over a schema and recursively put all the field names in our name map
    //

    function getFieldNamesFromSchema(schema,prefix) {
      for (var i=0; i< schema.length; i++)
        _.forEach(schema[i]['properties'], function(field, field_name) {
          addToken(prefix + field_name,"field");
          if (field['properties']) {
            getFieldNamesFromSchema([field['properties']],prefix + field_name + ".");
          }
        });
    }

    //
    // we also keep a history of executed queries and their results
    // we will permit forward and backward traversal of the history
    //

    function hasPrevResult() {return currentQueryIndex > 0};
    function hasNextResult() {return currentQueryIndex < pastQueries.length-1};
    function prevResult()
    {      
      if (currentQueryIndex > 0) // can't go earlier than the 1st
      {
        // if we are going backward from the end of the line, from a query that 
        // has been edited but hasn't been run yet, we need to add it to the 
        // history

        if (currentQueryIndex === (pastQueries.length-1) &&
            lastResult.query.trim() !== pastQueries[pastQueries.length-1].query.trim()) {
          var newResult = dummyResult.clone();
          newResult.query = lastResult.query;
          newResult.status = "not yet run";
          newResult.result = '{"no_data_yet": "hit execute to run query"}';
          newResult.data = {no_data_yet: "hit execute to run query"};
          pastQueries.push(newResult);
          currentQueryIndex++;
        }

        // 
        // the following gross hack is due to an angular issue where it doesn't 
        // successfully detect *some* changes in the result data, and thus doesn't 
        // update the table. So we set the result to blank, then back to a value 
        // after a certain delay.
        //

        lastResult.result = "";
        lastResult.data = "{}";

        $timeout(function(){
          currentQueryIndex--;
          lastResult.copyIn(pastQueries[currentQueryIndex]);
          currentQuery = lastResult.query;        
        },50);
      }
    }

    function nextResult()
    {
      if (currentQueryIndex < pastQueries.length -1) // can we go forward?
      {

        // 
        // see comment above about the delay hack.
        //

        lastResult.result = "";
        lastResult.data = "{}";

        $timeout(function(){
          currentQueryIndex++;
          lastResult.copyIn(pastQueries[currentQueryIndex]);
          currentQuery = lastResult.query;
        },50);
      }
    }

    function clearHistory() {
      lastResult.copyIn(dummyResult);
      pastQueries.length = 0;
      currentQueryIndex = 0;      
    }

    //
    // call the proxy which handles N1QL queries
    //

    function executeQuery(queryText) {
      var newResult;

      // if the current query is part of the history, update the results from the history

      if (currentQueryIndex < pastQueries.length &&
          lastResult.query.trim() === pastQueries[currentQueryIndex].query.trim()) {
        newResult = pastQueries[currentQueryIndex];
      }

      // otherwise, we have a new/edited query, so we create a new empty result
      // at the end of the query history

      else {
        newResult = new QueryResult("executing",0.0,0.0,0,'0B',
            '{"status": "Executing Query"}',
            {},lastResult.query);
        pastQueries.push(newResult);
        currentQueryIndex = pastQueries.length - 1; // after run, set current result to end
      }

      // don't allow multiple queries, as indicated by anything after a semicolon

      var stuffAfterSemi = /;\s*\S+/i;
      if (stuffAfterSemi.test(queryText)) {
        newResult.status = "Error";
        newResult.result = '{"error": "you cannot issue more than one query at once."}';
        newResult.data = {error: "Error, you cannot issue more than one query at once."};
        lastResult.copyIn(newResult);
        return null;
      }


      // don't allow multiple queries at once
      if (mnQueryService.busyExecutingQuery)
        return;

      mnQueryService.busyExecutingQuery = true;
      lastResult.result = '{"status": "Executing Query"}';
      lastResult.data = "{}";

//    var pre_post_ms = new Date().getTime();

      //
      // create a data structure for holding the query, and the credentials for any SASL
      // protected buckets
      //

      var queryData = {statement: queryText};
      var credString = "";
      for (var i = 0; i < mnQueryService.buckets.length; i++) { 
        if (credString.length > 0)
          credString += ",";

        var pw = mnQueryService.buckets[i].password ? 
            mnQueryService.buckets[i].password : "";

            credString += '{"user":"local:'+mnQueryService.buckets[i].id+'","pass":"' + 
            pw +'"}';
      }

      if (credString.length > 0)
        queryData.creds = '[' + credString + ']';

      //console.log("Got creds: " + queryData.creds);

      // send the query off via REST API
      return $http.post("/_p/query/query/service",queryData)
      .success(function(data, status, headers, config) {
        var result;

//      var post_post_ms = new Date().getTime();

        // make sure we show errors if the query did not succeed
        if (data.status == "success")
          result = data.results;
        else {
          var failed = "Authorization Failed";
          // hack - detect authorization failed, make a suggestion
          for (var i=0; i < data.errors.length; i++)
            if (data.errors[i].msg && 
                data.errors[i].msg.length >= failed.length &&
                data.errors[i].msg.substring(0,failed.length) == failed)
              data.errors[i].suggestion = "Try authorizing the necessary bucket(s) in the metadata panel to the left.";

          result = data.errors;
        }

        // if we got no metrics, create a dummy version

        if (!data.metrics) {
          data.metrics = {elapsedTime: 0.0, executionTime: 0.0, resultCount: 0, resultSize: "0B", elapsedTime: 0.0}
        }

        newResult.status = data.status;
        newResult.elapsedTime = data.metrics.elapsedTime;
        newResult.executionTime = data.metrics.executionTime;
        newResult.resultCount = data.metrics.resultCount;
        newResult.resultSize = data.metrics.resultSize + 'B';
        newResult.result = angular.toJson(result, true);
        newResult.data = result;
        newResult.requestID = data.requestID;
        lastResult.copyIn(newResult);

        // save the state
        saveStateToStorage();

        // all done 
        mnQueryService.busyExecutingQuery = false;      

//      var post2_ms = new Date().getTime();

//      $timeout(function(){
//      var post3_ms = new Date().getTime();
//      var diff1 = post_post_ms - pre_post_ms;
//      var diff2 = post2_ms - post_post_ms; 
//      var diff3 = post3_ms - post2_ms; 
//      console.log("Query execution time: " + diff1 + ", processing: " + diff2 + ", rendering: " + diff3);
//      },10);

      })
      .error(function(data, status, headers, config) {
        //console.log("Error Data: " + JSON.stringify(data));
        if (!data) {
          newResult.result = '{"status": "Failure contacting server."}';
          newResult.data = lastResult.result;
          newResult.status = "failed";
          lastResult.copyIn(newResult);
          mnQueryService.busyExecutingQuery = false;      
          return;
        }

        if (_.isString(data)) {
          newResult.data = {status: data};
          newResult.result = JSON.stringify(newResult.data);
          newResult.status = "failed";
          lastResult.copyIn(newResult);
          mnQueryService.busyExecutingQuery = false;      
          return;          
        }

        if (data.errors) {
          data.errors.push({original_query:queryText});
          newResult.data = data.errors;
          newResult.result = JSON.stringify(data.errors);
        }

        if (status)
          newResult.status = status;
        else 
          newResult.status = "failed";

        if (data.metrics) {
          newResult.elapsedTime = data.metrics.elapsedTime;
          newResult.executionTime = data.metrics.executionTime;
          newResult.resultCount = data.metrics.resultCount;
          newResult.resultSize = data.metrics.resultSize + 'B';
        }

        if (data.requestID)
          newResult.requestID = data.requestID;

        lastResult.copyIn(newResult);

        // save the state
        saveStateToStorage();

        mnQueryService.busyExecutingQuery = false;      
      });
    }

    //
    // manage metadata, including buckets, fields, and field descriptions
    //

    function updateBuckets() {
      if (mnQueryService.busyGettingBuckets)
        return;

      mnQueryService.busyGettingBuckets = true;
      mnQueryService.buckets.length = 0;

      // use a query to get buckets with a primary index
      //var queryText = "select distinct indexes.keyspace_id from system:indexes where is_primary = true order by indexes.keyspace_id ;";
      var queryText2 = "select indexes.keyspace_id, array_agg(index_key) primary_indexes " +
      "from system:indexes group by indexes.keyspace_id having array_agg(is_primary) " +
      "order by indexes.keyspace_id;";

      var queryText = 
        "select max(keyspace_id) id, max(has_primary) has_prim, max(has_second) has_sec, max(secondary_indexes) sec_ind from (" +
        " select indexes.keyspace_id, true has_primary" + 
        "  from system:indexes where is_primary = true" +
        "  union" +
        "  select indexes.keyspace_id, true has_second, array_agg(indexes.index_key) secondary_indexes, indexes.condition" + 
        "  from system:indexes where is_primary is missing or is_primary = false group by keyspace_id having keyspace_id is not null" +
        "  union" +
        "   select id keyspace_id from system:keyspaces except (select indexes.keyspace_id from system:indexes union select \"\" keyspace_id)" +
        "  ) foo group by keyspace_id having keyspace_id is not null order by keyspace_id";

      res1 = $http.post("/_p/query/query/service",{statement : queryText })
      .success(function(data, status, headers, config) {

        var bucket_names = [];
        var passwords = [];

        if (data && data.results) for (var i=0; i< data.results.length; i++) {
          var bucket = data.results[i];
          bucket.expanded = false;
          bucket.schema = [];
          bucket_names.push(bucket.id);
          bucket.passwordNeeded = false;
          passwords.push(""); // assume no password for now
          //console.log("Got bucket: " + bucket.id);
          mnQueryService.buckets.push(bucket);
          addToken(bucket.id,"bucket");
        }
        refreshAutoCompleteArray();      

        //
        // get the passwords from the REST API (how gross!)
        //

        res1 = $http.get("/pools/default/buckets")
        .success(function(data) {
          //
          // bucket data should be an array of objects, where each object has
          // 'name' and  'saslPassword' fields (amoung much other data)
          //

          if (_.isArray(data)) _.forEach(data, function(bucket, index) {
            if (bucket.name && _.isString(bucket.saslPassword)) 
              _.forEach(mnQueryService.buckets, function(mBucket, i) {
                if (mBucket.id === bucket.name) {
                  mBucket.password = bucket.saslPassword;
                  return(false);
                }
              });
          });

        });


        mnQueryService.busyGettingBuckets = false;
      })
      .error(function(data, status, headers, config) {
        mnQueryService.buckets.push({id: data.errors, schema: []});
        mnQueryService.busyGettingBuckets = false;
      });

    };

    //
    //  
    //

    function authenticateBuckets(bucket_names, passwords, onSuccess, onError) {
      $http.post("/authenticate",{bucket : bucket_names, password: passwords})
      .success(onSuccess)
      .error(onError);      
    };


    //
    // Get a schema for a given, named bucket.
    //

    function getSchemaForBucket(bucket) {

      var queryText = "describe `" + bucket.id + "`;";
      var queryData = {statement: queryText};
      if (bucket.password)
        queryData.creds = '[{"user":"local:'+bucket.id+'","pass":"' + bucket.password +'"}]';

      return $http.post("/_p/query/query/service",queryData)
      .success(function(data, status, headers, config) {
        //console.log("Done!");
        bucket.schema.length = 0;
        //console.log("Schema status: " + status);
        //console.log("Schema results: " + JSON.stringify(data));
        if (_.isString(data.results))
          bucket.schema_error = data.results;
        else if (data.results && data.results.error)
          bucket.schema_error = data.results.error;
        else {
          bucket.schema = data.results[0];

          var totalDocCount = 0;
          for (var i=0; i<bucket.schema.length; i++)
            totalDocCount += bucket.schema[i]['#docs'];

          getFieldNamesFromSchema(bucket.schema,"");        
          refreshAutoCompleteArray();      

          //console.log("for bucket: " + bucket.name + " got doc count: " + totalDocCount)
          bucket.totalDocCount = totalDocCount;

          for (var i=0; i<bucket.schema.length; i++)
            bucket.schema[i]['%docs'] = (bucket.schema[i]['#docs']/totalDocCount*100);

          // we have an array of columns that are indexed. Let's mark the individual
          // fields, now that we have a schema. 
          bucket.indexed_fields = {};

          // each element of the sec_ind array is an array of field names, turn into a map
          _.forEach(bucket.sec_ind,function(elem) {
            _.forEach(elem,function(field) {
              // for now we can't handle objects inside arrays, so we'll just flag the
              // array field as having an index. Also, we need to remove any parens.
              var bracket = field.indexOf('['); 
              if (bracket >= 0)
                field = field.substring(0,bracket);

              field = field.replace(/\(/g,'').replace(/\)/g,'');

              //console.log("Index on: " + field);
              bucket.indexed_fields[field] = true;
            })});

          for (var flavor=0; flavor<bucket.schema.length; flavor++) { // iterate over flavors
            markIndexedFields(bucket.indexed_fields, bucket.schema[flavor], "");
            bucket.schema[flavor].hasFields = Object.keys(bucket.schema[flavor].properties).length > 0;
          }

          bucket.schema.unshift({Summary: "Summary: " + bucket.schema.length + " document flavors found from a sample of "+ totalDocCount + " documents"});        
        }

      })
      .error(function(data, status, headers, config) {
        console.log("Query Error: " + JSON.stringify(data.errors));
      });

    };

    //
    // When we get the schema, we need to mark the indexed fields. We start at the top
    // level, but recursively traverse any subtypes, keeping track of the path that we
    // followed to get to the subtype.
    // 

    function markIndexedFields(fieldMap, schema, path) {
      //console.log("marking schema size: "+schema.fields.length + " with path: " + path);

      _.forEach(schema['properties'], function(theField, field_name) {
        // in the list of indexed fields, the field names are quoted with back quotes
        var quoted_field_name = '`' + field_name + '`';
        if (path.length > 0)
          quoted_field_name = path + quoted_field_name;

        //console.log(" checking field: " + quoted_field_name);

        // are we in the index map?
        if (fieldMap[quoted_field_name]) {
          theField.indexed = true;
        }

        // do we have a subtype to traverse?
        if (theField.properties)
          markIndexedFields(fieldMap,theField,path + '`' + field_name + '`.');
      });
    };

    //
    // load everything from storage if possible
    //

    loadStateFromStorage();

    //
    // all done creating the service, now return it
    //

    return mnQueryService;
  }



})();
