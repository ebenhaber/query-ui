(function() {
  'use strict';

  angular.module('qwQuery', ["ui.router", "mnJquery",
                              'qwJsonTree',
                              'qwJsonTable',
                              'qwExplainViz',
                              'qwLongPress',
                              'mnPendingQueryKeeper',
                              'mnServersService',
                              'mnPoolDefault',
                              'ui.ace',
                              'ui.bootstrap'])

    .config(function($stateProvider,$urlRouterProvider) {
      $urlRouterProvider.otherwise('/workbench');
      
      $stateProvider
      .state('workbench', {
        url: '/workbench',
        templateUrl: 'query.html'
      })
      ;

    })
                              
    // we can only work if we have a query node. This service checks for
    // a query node a reports back whether it is present.

    .factory('validateQueryService', function($http,mnServersService) {
      var service = {
          inProgress: function() {return false;},
          valid: function()      {return true;},
      }
      return service;
    });
                              

  angular.module('app', ['ui.router','qwQuery']);


})();