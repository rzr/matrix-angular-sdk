describe('EventStreamService', function() {
    var q, scope, timeout;

    var testInitialSync, testEventStream;

    var matrixService = {
        initialSync: function(limit, feedback) {
            var defer = q.defer();
            defer.resolve(testInitialSync);
            return defer.promise;
        },
        getEventStream: function(from, svrTimeout, cliTimeout) {
            var defer = q.defer();
            defer.resolve(testEventStream);
            return defer.promise;
        }
    };
    
    var eventHandlerService = {
        handleInitialSyncDone: function(response) {
        
        },
        
        handleEvents: function(chunk, isLive) {
        
        }
    };

    // setup the dependencies
    beforeEach(function() {
    
        // reset test data
        testInitialSync = {
            data: {
                end: "foo",
                presence: [],
                rooms: []
            }
        };
        testEventStream = {
            data: {
                start: "foostart",
                end: "fooend",
                chunk: []
            }
        };
    
        // dependencies
        module(function ($provide) {
          $provide.value('matrixService', matrixService);
          $provide.value('eventHandlerService', eventHandlerService);
        });
        
        // tested service
        module('eventStreamService');
    });
    
    beforeEach(inject(function($q, $rootScope, $timeout) {
        q = $q;
        scope = $rootScope;
        timeout = $timeout;
    }));

    it('should start with /initialSync then go onto /events', inject(
    function(eventStreamService) {
        spyOn(eventHandlerService, "handleInitialSyncDone");
        spyOn(eventHandlerService, "handleEvents");
        eventStreamService.resume();
        scope.$digest(); // initialSync request
        expect(eventHandlerService.handleInitialSyncDone).toHaveBeenCalledWith(testInitialSync);
        expect(eventHandlerService.handleEvents).toHaveBeenCalledWith(testEventStream.data.chunk, true);
    }));
    
    it('should use the end token in /initialSync for the next /events request', inject(
    function(eventStreamService) {
        spyOn(matrixService, "getEventStream").and.callThrough();
        eventStreamService.resume();
        scope.$digest(); // initialSync request
        expect(matrixService.getEventStream).toHaveBeenCalledWith("foo", eventStreamService.SERVER_TIMEOUT, jasmine.any(Object));
    }));
    
    it('should cancel the /events request when paused.', inject(
    function(eventStreamService) {
        var timeout = undefined; // this is the promise provided to $http.timeout
        var timeoutResolved = false; // flag to see if the cancel request was made
        var request = q.defer().promise; // the http request which we're blocking on
        spyOn(matrixService, "getEventStream").and.callFake(function(from, timeoutMs, promise) {
            timeout = promise;
            timeout.then(function(r){
                timeoutResolved = true;
            });
            return request;
        });
        eventStreamService.resume();
        scope.$digest(); // initialSync request
        expect(timeout).toBeDefined();
        expect(timeoutResolved).toBeFalsy();
        eventStreamService.pause();
        scope.$digest(); // resolving the timeout
        expect(timeoutResolved).toBeTruthy();
        
    }));
    
    it('should cancel the /events request when stopped.', inject(
    function(eventStreamService) {
        var timeout = undefined; // this is the promise provided to $http.timeout
        var timeoutResolved = false; // flag to see if the cancel request was made
        var request = q.defer().promise; // the http request which we're blocking on
        spyOn(matrixService, "getEventStream").and.callFake(function(from, timeoutMs, promise) {
            timeout = promise;
            timeout.then(function(r){
                timeoutResolved = true;
            });
            return request;
        });
        eventStreamService.resume();
        scope.$digest(); // initialSync request
        expect(timeout).toBeDefined();
        expect(timeoutResolved).toBeFalsy();
        eventStreamService.stop();
        scope.$digest(); // resolving the timeout
        expect(timeoutResolved).toBeTruthy();
        
    }));
    
    it('should broadcast a bad connection if there are multiple failed attempts.', inject(
    function(eventStreamService) {
        var request = q.defer(); // the http request which we're blocking on
        var timesCalled = 0;
        var isBadConnection = false;
        spyOn(matrixService, "getEventStream").and.callFake(function(from, timeoutMs, promise) {
            timesCalled += 1;
            return request.promise;
        });
        scope.$on(eventStreamService.BROADCAST_BAD_CONNECTION, function(ngEvent, isBad) {
            isBadConnection = isBad;
        });
        
        eventStreamService.resume();
        scope.$digest(); // initialSync request
        
        for (var i=0; i<eventStreamService.MAX_FAILED_ATTEMPTS; i++) {
            request.reject({data:{status:0}}); // reject no connection.
            request = q.defer(); // make a new promise in prep for the next request
            scope.$digest(); // invoke the .then
            timeout.flush(); // flush the waiting period.
        }
        
        expect(timesCalled).toBe(eventStreamService.MAX_FAILED_ATTEMPTS + 1);
        expect(isBadConnection).toBe(true);
        
    }));
    
    it('should broadcast a good connection if a successful attempt goes through after bad ones.', inject(
    function(eventStreamService) {
        var request = q.defer(); // the http request which we're blocking on
        var timesCalled = 0;
        var isBadConnection = false;
        spyOn(matrixService, "getEventStream").and.callFake(function(from, timeoutMs, promise) {
            timesCalled += 1;
            return request.promise;
        });
        scope.$on(eventStreamService.BROADCAST_BAD_CONNECTION, function(ngEvent, isBad) {
            isBadConnection = isBad;
        });
        
        eventStreamService.resume();
        scope.$digest(); // initialSync request
        
        for (var i=0; i<(eventStreamService.MAX_FAILED_ATTEMPTS + 1); i++) {
            request.reject({data:{status:0}}); // reject no connection.
            request = q.defer(); // make a new promise in prep for the next request
            scope.$digest(); // invoke the .then
            timeout.flush(); // flush the waiting period.
        }
        
        expect(isBadConnection).toBe(true);
        
        // successful connection now
        request.resolve({data: {chunk:[],start:"s",end:"e"}});
        request = q.defer();
        scope.$digest();
        expect(isBadConnection).toBe(false);
    }));
});
