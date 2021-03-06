(function() {


  angular.module('qwQuery').controller('qwQueryController', queryController);

  queryController.$inject = ['$rootScope', '$uibModal', '$timeout', 'qwQueryService', 'validateQueryService','mnPools','$scope','qwConstantsService'];

  function queryController ($rootScope, $uibModal, $timeout, qwQueryService, validateQueryService, mnPools, $scope, qwConstantsService) {

    var qc = this;
    //console.log("Start controller at: " + new Date().toTimeString());

    //
    // current UI version number
    //

    qc.version = "1.0.6 (DP 6)";

    //
    // alot of state is provided by the qwQueryService
    //

    qc.buckets = qwQueryService.buckets;                // buckets on cluster
    qc.gettingBuckets = qwQueryService.gettingBuckets;  // busy retrieving?
    qc.updateBuckets = qwQueryService.updateBuckets;    // function to update
    qc.lastResult = qwQueryService.getResult(); // holds the current query and result
    //qc.limit = qwQueryService.limit;            // automatic result limiter
    qc.executingQuery = qwQueryService.executingQuery;

    // some functions for handling query history, going backward and forward

    qc.prev = prevResult;
    qc.next = nextResult;

    qc.hasNext = qwQueryService.hasNextResult;
    qc.hasPrev = qwQueryService.hasPrevResult;

    qc.canCreateBlankQuery = qwQueryService.canCreateBlankQuery;

    qc.getCurrentIndex = qwQueryService.getCurrentIndex;
    qc.clearHistory= qwQueryService.clearHistory;

    qc.historyMenu = edit_history;

    // variable and code for managing the choice of output format in different tabs

    qc.selectTab = selectTab;
    qc.isSelected = qwQueryService.isSelected;

    qc.status_success = qwQueryService.status_success;
    qc.status_fail = qwQueryService.status_fail;

    //
    // options for the two editors, query and result
    //

    qc.aceInputLoaded = aceInputLoaded;
    qc.aceInputChanged = aceInputChanged;
    qc.aceOutputLoaded = aceOutputLoaded;
    qc.aceOutputChanged = aceOutputChanged;
    qc.updateEditorSizes = updateEditorSizes;

    qc.acePlanLoaded = acePlanLoaded;
    qc.acePlanChanged = acePlanChanged;

    //
    // expand/collapse the analysis pane
    //

    qc.analysisExpanded = false;
    qc.toggleAnalysisSize = toggleAnalysisSize;

    //
    // functions for running queries and saving results
    //

    qc.query = query;
    qc.save = save;
    qc.save_query = save_query;
    qc.options = options;

    qc.load_query = load_query;

    //
    // options for the two Ace editors, the input and the output
    //

    qc.aceInputOptions = {
        mode: qwConstantsService.queryMode,
        showGutter: true,
        onLoad: qc.aceInputLoaded,
        onChange: qc.aceInputChanged,
        $blockScrolling: Infinity
    };

    qc.aceOutputOptions = {
        mode: 'json',
        showGutter: true,
        useWrapMode: true,
        onLoad: qc.aceOutputLoaded,
        onChange: qc.aceOutputChanged,
        $blockScrolling: Infinity
    };

    qc.acePlanOptions = {
        mode: 'json',
        showGutter: true,
        useWrapMode: true,
        onLoad: qc.acePlanLoaded,
        onChange: qc.acePlanChanged,
        $blockScrolling: Infinity
    };

    //
    // Do we have a REST API to work with?
    //

    qc.validated = validateQueryService;

    //
    // error message when result is too large to display
    //

    qc.maxTableSize = 750000;
    qc.maxTreeSize = 750000;
    qc.maxAceSize = 10485760;
    qc.maxSizeMsgTable = {error: "The table view is slow with results sized > " + qc.maxTableSize + " bytes. Try using the JSON view or specifying a lower limit in your query."};
    qc.maxSizeMsgTree = {error: "The tree view is slow with results sized > " + qc.maxTreeSize + " bytes. Try using the JSON view or specifying a lower limit in your query."};
    qc.maxSizeMsgJSON = "{\"error\": \"The JSON view is slow with results sized > " + qc.maxAceSize + " bytes. Try specifying a lower limit in your query.\"}";

    qc.showBigDatasets = false;     // allow the user to override the limit on showing big datasets

    qc.dataTooBig = dataTooBig;
    qc.setShowBigData = setShowBigData;
    qc.getBigDataMessage = getBigDataMessage;

    qc.renderPage = function() {updateEditorSizes();};

    // should we have the extra explain tabs?

    qc.autoExplain = qwConstantsService.autoExplain;

    qc.showBucketAnalysis = qwConstantsService.showBucketAnalysis;

    qc.showOptions = qwConstantsService.showOptions;

    //
    // does the browser support file choosing?
    //

    qc.fileSupport = (window.File && window.FileReader && window.FileList && window.Blob);

    //
    // labels for bucket analysis pane
    qc.fullyQueryableBuckets = qwConstantsService.fullyQueryableBuckets;
    qc.queryOnIndexedBuckets = qwConstantsService.queryOnIndexedBuckets;
    qc.nonIndexedBuckets = qwConstantsService.nonIndexedBuckets;

    //
    // call the activate method for initialization
    //

    activate();

    //
    // Is the data too big to display for the selected results pane?
    //

    function dataTooBig() {
      switch (qwQueryService.outputTab) {
      case 1: return(qc.lastResult.resultSize / qc.maxAceSize) > 1.1;
      case 2: return(qc.lastResult.resultSize / qc.maxTableSize) > 1.1;
      case 3: return(qc.lastResult.resultSize / qc.maxTreeSize) > 1.1;
      }

    }

    //
    // get a string to describe why the dataset is large
    //

    function getBigDataMessage() {
      var fraction;
      switch (qwQueryService.outputTab) {
      case 1: fraction = qc.lastResult.resultSize / qc.maxAceSize; break;
      case 2: fraction = qc.lastResult.resultSize / qc.maxTableSize; break;
      case 3: fraction = qc.lastResult.resultSize / qc.maxTreeSize; break;
      }
      var timeEstimate = Math.round(fraction * 2.5);
      var timeUnits = "seconds";
      if (timeEstimate > 60) {
        timeEstimate = Math.round(timeEstimate/60);
        timeUnits = "minutes";
      }
      var message = "The current dataset, " + qc.lastResult.resultSize + " " +
        "bytes, is too large to display quickly.<br>Using a lower limit or a more " +
        "specific where clause in your query can reduce result size. Rendering " +
        "might freeze your browser for " + timeEstimate + " to " + timeEstimate*4 +
        " " + timeUnits + " or more. ";

      if (qwQueryService.outputTab != 1) {
        message += "The JSON view is about 10x faster. ";
      }

      return(message);
    }

    function setShowBigData(show)
    {
      qc.showBigDatasets = show;
      $timeout(swapEditorFocus,10);
    }

    //
    // change the tab selection
    //

    function selectTab(tabNum) {
      if (qc.isSelected(tabNum))
        return; // avoid noop

      qc.showBigDatasets = false;
      qwQueryService.selectTab(tabNum);
      // select focus after a delay to try and force update of the editor
      $timeout(swapEditorFocus,10);
    };

    //
    // we need to define a wrapper around qw_query_server.nextResult, because if the
    // user creates a new blank query, we need to refocus on it.
    //

    function nextResult() {
      qc.showBigDatasets = false;
      qwQueryService.nextResult();
      $timeout(swapEditorFocus,10);
    }

    function prevResult() {
      qc.showBigDatasets = false;
      qwQueryService.prevResult();
      $timeout(swapEditorFocus,10);
    }

    //
    // the text editor doesn't update visually if changed when off screen. Force
    // update by focusing on it
    //

    function swapEditorFocus() {
      if (qc.outputEditor) {
        qc.outputEditor.focus();
        qc.inputEditor.focus();
      }
      updateEditorSizes();
    }

    //
    // manage the ACE code editors for query input and JSON output
    //

    var endsWithSemi = /;\s*$/i;

    function aceInputChanged(e) {
      //console.log("input changed, action: " + JSON.stringify(e[0]));
      //console.log("current session : " + JSON.stringify(qc.inputEditor.getSession()));
      // show a placeholder when nothing has been typed
      var curSession = qc.inputEditor.getSession();
      var noText = curSession.getValue().length == 0;
      var emptyMessageNode = qc.inputEditor.renderer.emptyMessageNode;

      //console.log("Notext: " +noText + ", emptyMessageNode: " + emptyMessageNode);
      if (noText && !emptyMessageNode) {
        emptyMessageNode = qc.inputEditor.renderer.emptyMessageNode = document.createElement("div");
        emptyMessageNode.innerText = "Enter a query here.";
        emptyMessageNode.className = "ace_invisible ace_emptyMessage";
        emptyMessageNode.style.padding = "0 5px";
        qc.inputEditor.renderer.scroller.appendChild(emptyMessageNode);
      }
      else if (!noText && emptyMessageNode) {
        qc.inputEditor.renderer.scroller.removeChild(emptyMessageNode);
        qc.inputEditor.renderer.emptyMessageNode = null;
      }

      qc.inputEditor.$blockScrolling = Infinity;

      // for inserts, by default move the cursor to the end of the insert

      if (e[0].action === 'insert') {
        updateEditorSizes();
        qc.inputEditor.moveCursorToPosition(e[0].end);
        qc.inputEditor.focus();

        // if they pasted more than one line, and we're at the end of the editor, trim
        var pos = qc.inputEditor.getCursorPosition();
        var line = qc.inputEditor.getSession().getLine(pos.row);
        if (e[0].lines && e[0].lines.length > 1 && e[0].lines[0].length > 0 &&
            pos.row == (qc.inputEditor.getSession().getLength()-1) &&
            pos.column == line.length)
          qc.lastResult.query = qc.lastResult.query.trim();

        // if they hit enter and the query ends with a semicolon, run the query
        if (qwConstantsService.autoExecuteQueryOnEnter && // auto execute enabled
            e[0].lines && e[0].lines.length == 2 && // <cr> marked by two empty lines
            e[0].lines[0].length == 0 &&
            e[0].lines[1].length == 0 &&
            e[0].start.column > 0 && // and the previous line wasn't blank
            curSession.getLine(e[0].start.row).trim()[curSession.getLine(e[0].start.row).trim().length -1] === ';' &&
            endsWithSemi.test(qc.lastResult.query))
          qc.query();
      }

    };

    //
    // initialize the query editor
    //

    function aceInputLoaded(_editor) {
      var langTools = ace.require("ace/ext/language_tools");

      _editor.$blockScrolling = Infinity;
      _editor.setFontSize('13px');
      _editor.renderer.setPrintMarginColumn(false);
      _editor.setReadOnly(qc.executingQuery.busy);

      if (/^((?!chrome).)*safari/i.test(navigator.userAgent))
        _editor.renderer.scrollBarV.width = 20; // fix for missing scrollbars in Safari

      qc.inputEditor = _editor;

      // this function is used for autocompletion of dynamically known names such
      // as bucket names, field names, and so on. We only want to return items that
      // either start with the prefix, or items where the prefix follows a '.'
      // (meaning that the prefix is a field name from a path

      var identifierCompleter = {
          getCompletions: function(editor, session, pos, prefix, callback) {
            var results = [];
            var modPrefix = '.' + prefix;
            var modPrefix2 = '`' + prefix;
            //console.log("Looking for: *" + prefix + "*");
            for (var i=0; i<qwQueryService.autoCompleteArray.length; i++) {
              //console.log("  *" + qwQueryService.autoCompleteArray[i].caption + "*");
              if (_.startsWith(qwQueryService.autoCompleteArray[i].caption,prefix) ||
                  qwQueryService.autoCompleteArray[i].caption.indexOf(modPrefix) >= 0 ||
                  qwQueryService.autoCompleteArray[i].caption.indexOf(modPrefix2) >= 0) {
                //console.log("    Got it!");
                results.push(qwQueryService.autoCompleteArray[i]);
              }
            }
            callback(null,results);
          }
      };

      //
      // only support auto-complete if we're in enterprise mode
      //

      if (mnPools.export.isEnterprise) {
        _editor.setOptions({enableBasicAutocompletion: true});
        langTools.addCompleter(identifierCompleter);
      }

      focusOnInput();

      //
      // make the query editor "catch" drag and drop files
      //

      $("#query_editor")[0].addEventListener('dragover',handleDragOver,false);
      $("#query_editor")[0].addEventListener('drop',handleFileDrop,false);
      $("#loadQuery")[0].addEventListener('change',handleFileSelect,false);
    };

    //
    // We want to be able to handle a file drop on the query editor. Default behavior
    // is to change the browser to a view of that file, so we need to override that
    //

    function handleDragOver(evt) {
      evt.stopPropagation();
      evt.preventDefault();
      evt.dataTransfer.dropEffect = 'copy';
    }

    //
    // When they drop the file, take the contents and put in the
    //
    function handleFileSelect() {
      loadQueryFileList(this.files);
    }


    function handleFileDrop(evt) {
      evt.stopPropagation();
      evt.preventDefault();

      var files = evt.dataTransfer.files; // FileList object.
      loadQueryFileList(files);
    }

    function loadQueryFileList(files) {
      // files is a FileList of File objects. load the first one into the editor, if any.
      if (files.length >= 1) {
        var reader = new FileReader();
        reader.addEventListener("loadend",function() {qc.inputEditor.getSession().setValue(reader.result);});
        reader.readAsText(files[0]);
      }
    }

    // when they click the Load Query button

    function load_query() {
      $("#loadQuery")[0].click();
    }

    //
    // Initialize the output ACE editor
    //

    function aceOutputLoaded(_editor) {
      //console.log("AceOutputLoaded");
      _editor.$blockScrolling = Infinity;
      _editor.setReadOnly(true);
      _editor.renderer.setPrintMarginColumn(false); // hide page boundary lines

      if (/^((?!chrome).)*safari/i.test(navigator.userAgent))
        _editor.renderer.scrollBarV.width = 20; // fix for missing scrollbars in Safari

      qc.outputEditor = _editor;
      updateEditorSizes();
    };

    function aceOutputChanged(e) {
      updateEditorSizes();

      // show a placeholder when nothing has been typed
      var curSession = qc.outputEditor.getSession();
      var noText = curSession.getValue().length == 0;
      var emptyMessageNode = qc.outputEditor.renderer.emptyMessageNode;

      //console.log("Notext: " +noText + ", emptyMessageNode: " + emptyMessageNode);
      if (noText && !emptyMessageNode) {
        emptyMessageNode = qc.outputEditor.renderer.emptyMessageNode = document.createElement("div");
        emptyMessageNode.innerText =
          'See JSON, Table, and Tree formatted query results here.\n'+
          'Hover over field names (in the tree layout) to see their full path.';
        emptyMessageNode.className = "ace_invisible ace_emptyMessage";
        emptyMessageNode.style.padding = "0 5px";
        qc.outputEditor.renderer.scroller.appendChild(emptyMessageNode);
      }
      else if (!noText && emptyMessageNode) {
        qc.outputEditor.renderer.scroller.removeChild(emptyMessageNode);
        qc.outputEditor.renderer.emptyMessageNode = null;
      }

    }

    function acePlanLoaded(_editor) {
      //console.log("AcePlanLoaded");
      _editor.$blockScrolling = Infinity;
      _editor.setReadOnly(true);
      _editor.renderer.setPrintMarginColumn(false); // hide page boundary lines

      if (/^((?!chrome).)*safari/i.test(navigator.userAgent))
        _editor.renderer.scrollBarV.width = 20; // fix for missing scrollbars in Safari

      //qc.outputEditor = _editor;
      updateEditorSizes();
    }

    function acePlanChanged(e) {
      //e.$blockScrolling = Infinity;

      updateEditorSizes();
    }
    //
    // called when the JSON output changes. We need to make sure the editor is the correct size,
    // since it doesn't auto-resize
    //

    function updateEditorSizes() {
      var margins = 200;
      //if (navigator.userAgent.match(/safari/i))
      //	constant = 10;
      var windowHeight = window.innerHeight;
      var pageFooterHeight =  96; //$('#page_footer').height();
      var pageHeaderHeight = 42;
      var headerNavHeight =  $('#headerNav').height();
      if (headerNavHeight == null)
        headerNavHeight = 47;
      var queryBoxHeight = $('#query_box').height();
      var resultHeaderHeight =  $('#result_header').height();
      var sidebarHeaderHeight =  $('#sidebar_header').height();
      var resultSummaryHeight = $('#result_summary').height();
      var current_ui = $('#currentUI').height() != null;

      var otherStuff = pageHeaderHeight + pageFooterHeight +
        headerNavHeight + queryBoxHeight;

      if (//pageHeaderHeight == null || pageFooterHeight == null ||
          headerNavHeight == null || queryBoxHeight == null) {
        return;
      }

      var editor_size = windowHeight - otherStuff - margins - resultHeaderHeight;
      if (editor_size > 1000)
        editor_size = 1000;
      if (current_ui)
        editor_size += 70;
      else
        editor_size += 140;
      if (editor_size < 0)
        editor_size = 0;

//    console.log("pageHeaderHeight: " + pageHeaderHeight);
//    console.log("pageFooterHeight: " + pageFooterHeight);
//    console.log("headerNavHeight: " + headerNavHeight);
//    console.log("queryBoxHeight: " + queryBoxHeight);
//      console.log("windowHeight: " + windowHeight);
//      console.log("resultHeaderHeight: " + resultHeaderHeight);
//      console.log("resultSummaryHeight: " + resultSummaryHeight + "\n\n");
//      console.log(" current_ui: " + current_ui);
//      console.log(" editor_size: " + editor_size);


      if (!current_ui) { // classic UI
        // ignore small changes less than 1% of size
        var change = $('#result_editor').height()/(editor_size + 9);
        if (change < 0.99 || change > 1.01) {
          $('#sidebar_body').height(editor_size + resultHeaderHeight - sidebarHeaderHeight + resultSummaryHeight + 25);
          $('#result_editor').height(editor_size + 9);
          $('#result_table').height(editor_size+25);
          $('#result_tree').height(editor_size+ 24);
          $('#query_plan').height(editor_size + 15);
          $('#query_plan_text').height(editor_size + 25);
        //$('#result_box').height(editor_size+50);
        }
      }
      else {
        var sidebarHeight = windowHeight - pageHeaderHeight - pageFooterHeight -
          sidebarHeaderHeight - 80;
        $('#sidebar_body').height(sidebarHeight);
        $('#result_editor').height(editor_size);
        $('#result_table').height(editor_size+25);
        $('#result_tree').height(editor_size+15);
        $('#query_plan').height(editor_size + 15);
        $('#query_plan_text').height(editor_size + 25);
        //$('#result_box').height(editor_size+50);
      }


      //
      // allow the query editor to grow and shrink a certain amount based
      // on the number of lines in the query
      //
      // as the query is edited, allow it more vertical space, but max sure it
      // doesn't have fewer than 5 lines or more than ~50% of the window

      if (qc.inputEditor) {
        var queryAreaHeight = Math.max($('#query_wrapper').height(),240);
        var queryHeaderHeight = $('#query_header').height();
        var curSession = qc.inputEditor.getSession();
        var lines = curSession.getLength();
        var halfScreen = queryAreaHeight/2-queryHeaderHeight*3;
        var height = Math.max(75,(lines-1)*17); // make sure height no less than 75
        if (halfScreen > 75 && height > halfScreen)
          height = halfScreen;

        //console.log("QueryAreaHeight: " + queryAreaHeight + ", queryHeaderHeight: " + queryHeaderHeight);
        //console.log("Half screen: " + halfScreen + ", Area height: " + queryAreaHeight + ", header: " + queryHeaderHeight + ", setting height to: " + height);

        $("#query_editor").height(height);
      }


    }

    $(window).resize(updateEditorSizes);

    //
    // make the focus go to the input field, so that backspace doesn't trigger
    // the browser back button
    //

    function focusOnInput()  {
      if (qc.inputEditor && qc.inputEditor.focus)
        qc.inputEditor.focus();
    }

    //
    // functions for running queries and saving results to a file
    //

    function query() {
      // if a query is already running, we should cancel it
      if (qc.executingQuery.busy) {
        qwQueryService.cancelQuery();
        return;
      }

      // don't let the user edit the query while it's running
      qc.inputEditor.setReadOnly(true);

      // remove trailing whitespace to keep query from growing, and avoid
      // syntax errors (query parser doesn't like \n after ;
      if (endsWithSemi.test(qc.lastResult.query))
        qc.lastResult.query = qc.lastResult.query.trim();

      var queryStr = qc.lastResult.query;

      //console.log("Running query: " + queryStr);
      // run the query and show a spinner

      var promise = qwQueryService.executeQuery(queryStr,qc.lastResult.query,dialogScope.options);

      if (promise) {
        // also have the input grab focus at the end
        promise.success(doneWithQuery)
        .error(doneWithQuery);
      }
      else
        doneWithQuery();
    };

    //
    // when a query finishes, we need to re-enable the query field, and try and put
    // the focus there
    //

    function doneWithQuery() {
      qc.inputEditor.setReadOnly(false);
      updateEditorSizes();
      focusOnInput();
    }

    //
    // save the results to a file. Here we need to use a scope to to send the file name
    // to the file name dialog and get it back again.
    //

    var dialogScope = $rootScope.$new(true);

    // default names for save and save_query
    dialogScope.data_file = {name: "data.json"};
    dialogScope.query_file = {name: "n1ql_query.txt"};
    dialogScope.options = qwQueryService.options;

    function options() {
      var subdirectory = ($('#currentUI').height() != null) ? '/ui-current' : '/ui-classic';

      var promise = $uibModal.open({
        templateUrl: '../_p/ui/query' + subdirectory +
                     '/prefs_dialog/qw_prefs_dialog.html',
        scope: dialogScope
      }).result;

      // now save it
//      promise.then(function (res) {
//      });

    }

    function save() {
      var isSafari = /^((?!chrome).)*safari/i.test(navigator.userAgent);

      // safari does'nt support saveAs
      if (isSafari) {
        var file = new Blob([qc.lastResult.result],{type: "text/json", name: "data.json"});
        saveAs(file,dialogScope.data_file.name);
        return;
      }

      // but for those that do, get a name for the file
      dialogScope.file_type = 'json ';
      dialogScope.file = dialogScope.data_file;
      var subdirectory = ($('#currentUI').height() != null) ? '/ui-current' : '/ui-classic';

      var promise = $uibModal.open({
        templateUrl: '../_p/ui/query' + subdirectory +
                     '/file_dialog/qw_query_file_dialog.html',
        scope: dialogScope
      }).result;

      // now save it
      promise.then(function (res) {
        //console.log("Promise, file: " + tempScope.file.name + ", res: " + res);
        var file = new Blob([qc.lastResult.result],{type: "text/json"});
        saveAs(file,dialogScope.file.name);
      });
    };


    //
    // save the current query to a file. Here we need to use a scope to to send the file name
    // to the file name dialog and get it back again.
    //

    function save_query() {
      var isSafari = /^((?!chrome).)*safari/i.test(navigator.userAgent);

      // safari does'nt support saveAs
      if (isSafari) {
        var file = new Blob([qc.lastResult.query],{type: "text/json", name: "data.json"});
        saveAs(file,dialogScope.query_file.name);
        return;
      }

      // but for those that do, get a name for the file
      dialogScope.file_type = 'query ';
      dialogScope.file = dialogScope.query_file;
      var subdirectory = ($('#currentUI').height() != null) ? '/ui-current' : '/ui-classic';

      var promise = $uibModal.open({
        templateUrl: '../_p/ui/query' + subdirectory +
                     '/file_dialog/qw_query_file_dialog.html',
        scope: dialogScope
      }).result;

      // now save it
      promise.then(function (res) {
        //console.log("Promise, file: " + tempScope.file.name + ", res: " + res);
        var file = new Blob([qc.lastResult.query],{type: "text/plain"});
        saveAs(file,dialogScope.file.name);
      });
    };

    //
    // save the current query to a file. Here we need to use a scope to to send the file name
    // to the file name dialog and get it back again.
    //

    function edit_history() {

      // history dialog needs a pointer to the query service
      dialogScope.pastQueries = qwQueryService.getPastQueries();
      dialogScope.select = function(index) {qwQueryService.setCurrentIndex(index);};
      dialogScope.isRowSelected = function(row) {return(row == qwQueryService.getCurrentIndexNumber());};
      dialogScope.isRowMatched = function(row) {return(_.indexOf(historySearchResults,row) > -1);};
      dialogScope.showRow = function(row) {return(historySearchResults.length == 0 || dialogScope.isRowMatched(row));};
      dialogScope.del = qwQueryService.clearCurrentQuery;
      dialogScope.delAll = qwQueryService.clearHistory;
      dialogScope.searchInfo = searchInfo;
      dialogScope.updateSearchResults = updateSearchResults;
      dialogScope.selectNextMatch = selectNextMatch;
      dialogScope.selectPrevMatch = selectPrevMatch;

      var subdirectory = ($('#currentUI').height() != null) ? '/ui-current' : '/ui-classic';

      var promise = $uibModal.open({
        templateUrl: '../_p/ui/query' + subdirectory +
                     '/history_dialog/qw_history_dialog.html',
        scope: dialogScope
      }).result;

      // scroll the dialog's table
      $timeout(scrollHistoryToSelected,100);

    };

    var historySearchResults = [];
    var searchInfo = {searchText: "", searchLabel: "search:"};

    function scrollHistoryToSelected() {
      var label = "qw_history_table_"+qwQueryService.getCurrentIndexNumber();
      var elem = document.getElementById(label);
      if (elem)
        elem.scrollIntoView();
      window.scrollTo(0,0);
    }

    function updateSearchLabel() {
      if (searchInfo.searchText.trim().length == 0)
        searchInfo.searchLabel = "search:";
      else
        searchInfo.searchLabel = historySearchResults.length + " matches";
    }

    function updateSearchResults() {
      var history = qwQueryService.getPastQueries();
      // reset the history
      historySearchResults.length = 0;
      if (searchInfo.searchText.trim().length > 0)
        for (var i=0; i<history.length; i++) {
          //console.log("  comparing to: " + history[i].query)
          if (history[i].query.indexOf(searchInfo.searchText) > -1)
            historySearchResults.push(i);
        }

      updateSearchLabel();

      if (historySearchResults.length == 0)
        scrollHistoryToSelected();
    }

    // get the next/previous query matching the search results

    function selectNextMatch() {
      var curMatch = qwQueryService.getCurrentIndexNumber();

      // nothing to do if no search results
      if (historySearchResults.length == 0)
        return;

      // need to find the value in the history array larger than the current selection, or wrap around
      for (var i=0; i < historySearchResults.length; i++)
        if (historySearchResults[i] > curMatch) {
          qwQueryService.setCurrentIndex(historySearchResults[i]);
          scrollHistoryToSelected();
          return;
        }

      // if we get this far, wrap around to the beginning
      qwQueryService.setCurrentIndex(historySearchResults[0]);
      scrollHistoryToSelected();
    }

    function selectPrevMatch() {
      var curMatch = qwQueryService.getCurrentIndexNumber();

      // nothing to do if no search results
      if (historySearchResults.length == 0)
        return;

      // need to find the last value in the history array smaller than the current selection, or wrap around
      for (var i=historySearchResults.length-1;i>=0; i--)
        if (historySearchResults[i] < curMatch) {
          qwQueryService.setCurrentIndex(historySearchResults[i]);
          scrollHistoryToSelected();
          return;
        }

      // if we get this far, wrap around to the beginning
      qwQueryService.setCurrentIndex(historySearchResults[historySearchResults.length-1]);
      scrollHistoryToSelected();
    }

     //
    // toggle the size of the analysis pane
    //

    function toggleAnalysisSize() {
      if (!qc.analysisExpanded) {
        $("#metadata").removeClass("width-3");
        $("#metadata").addClass("width-6");
      //  if ($('#result_box').hasClass('classic-ui')) {
          $("#query_wrapper").removeClass("width-9");
          $("#query_wrapper").addClass("width-6")
      //  }
      }
      else {
        $("#metadata").removeClass("width-6");
        $("#metadata").addClass("width-3");
      //  if ($('#result_box').hasClass('classic-ui')) {
          $("#query_wrapper").removeClass("width-6");
          $("#query_wrapper").addClass("width-9");
      //  }
      }
      qc.analysisExpanded = !qc.analysisExpanded;
    }


    //
    // show an error dialog
    //

    function showErrorMessage(message) {
      var subdirectory = ($('#currentUI').height() != null) ? '/ui-current' : '/ui-classic';

      $uibModal.open({
        templateUrl: '../_p/ui/query' + subdirectory + '/password_dialog/qw_query_error_dialog.html',
        scope: {error_title: "Error", error_detail: message}
      });
    }

    //
    // let's start off with a list of the buckets
    //

    function activate() {
      qc.validated.updateValidBuckets();

      // Prevent the backspace key from navigating back. Thanks StackOverflow!
      $(document).unbind('keydown').bind('keydown', function (event) {
        var doPrevent = false;
        if (event.keyCode === 8) {
          var d = event.srcElement || event.target;
          if ((d.tagName.toUpperCase() === 'INPUT' &&
              (
                  d.type.toUpperCase() === 'TEXT' ||
                  d.type.toUpperCase() === 'PASSWORD' ||
                  d.type.toUpperCase() === 'FILE' ||
                  d.type.toUpperCase() === 'SEARCH' ||
                  d.type.toUpperCase() === 'EMAIL' ||
                  d.type.toUpperCase() === 'NUMBER' ||
                  d.type.toUpperCase() === 'DATE' )
          ) ||
          d.tagName.toUpperCase() === 'TEXTAREA') {
            doPrevent = d.readOnly || d.disabled;
          }
          else {
            doPrevent = true;
          }
        }

        if (doPrevent) {
          event.preventDefault();
        }
      });

      // get the list of buckets
      //qc.updateBuckets();

      //$( "#resizable-2" ).resizable({
      //  animate: true
    // });
      //$(".resizable").resizable({handles: "w"});

      //
      // now let's make sure the window is the right size
      //

      $timeout(updateEditorSizes(),100);
    }

  }


})();
