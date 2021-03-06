'use strict'

app.directive('ngTrack', ['$templateCache', function ($templateCache) {
    return {
        templateNamespace: 'svg',
        //template: '<svg height="800" style="display: inline-block" width="60%" ng-transclude></svg>',
        templateUrl: $templateCache.get('track.html'),
        restrict: 'E',
        replace: true,
        transclude: true
    };
}]);

app.directive('powermeter', function () {
    return {
        template: '<div style="height: {{(car.engine.revs/car.engine.maxRevs)*100}}px;background-color: red"></div>',
        restrict: 'E',
        transclude: true,
        replace: true
    };
});

app.directive('fueltank', function () {
    return {
        template: '<div style="height: {{(car.fuelTank.fuelLeft/car.fuelTank.tankSize)*100}}px;background-color: black"></div>',
        restrict: 'E',
        transclude: true,
        replace: true
    };
});

app.directive('speedometer', function () {
    return {
        template: '<div>speed:{{car.currentPresumedSpeed}},actual:{{car.actualSpeed}}</div>',
        restrict: 'E',
        transclude: true,
        replace: true
    };
});

app.directive('gearbox', function () {
    return {
        template: '<div>gear:{{car.gearbox.currentGear}} (gear up: {{car.keys.gearUpString}})</div>',
        restrict: 'E',
        transclude: true,
        replace: true
    };
});

app.directive('steering', function () {
    return {
        template: '<div>angle:{{car.steering.angle.toFixed(4)}}</div>',
        restrict: 'E',
        transclude: true,
        replace: true
    };
});

app.directive('startlights', function () {
    return {
        templateUrl: './html/startlights.html',
        restrict: 'E',
        replace: true,
        transclude: true,
        controller: 'startlightscontroller'
    };
});

app.directive('car', ['socketService', '$templateCache', 'eventBroadcast', function (socketService, $templateCache, eventBroadcast) {
    return {
        templateNamespace: 'svg',
        restrict: 'E',
        replace: true,
        templateUrl: $templateCache.get('carTemplateOldSkool.html'),
        link: function (scope, element) {

            var car = scope.car;

            setFrontWheelCenters(car, element);

            var keyup = Rx.Observable.fromEvent(document, 'keyup');
            var keydown = Rx.Observable.fromEvent(document, 'keydown');

            var gasKeyFilter = function (kbevent) {
                return kbevent.which === car.keys.gas;
            };
            var steerLeftFilter = function (kbevent) {
                return kbevent.which === car.keys.left;
            };
            var steerRightFilter = function (kbevent) {
                return kbevent.which === car.keys.right;
            };
            var gearUpFilter = function (kbevent) {
                return kbevent.which === car.keys.gearUp;
            };

            //TODO: I haven't modeled the entire gearbox yet, so I just want one gear-up (= up from N) in the game.
            keydown.filter(gearUpFilter).take(1).subscribe(function () {
                car.changeUp();
                scope.$apply();
            });

            keydown.filter(gasKeyFilter)
                .selectMany(function () {
                    return Rx.Observable.interval(0, model.GAS_PEDAL_SAMPLING_RATE)
                        .takeUntil(keyup.filter(gasKeyFilter))
                        .takeWhile(function () { return scope.car.currentPresumedSpeed < scope.car.maxspeed; });
                })
                .repeat()
                .subscribe(function () {
                    car.accelerate();
                    scope.$apply();
                });

            var turnLeft = keydown.filter(steerLeftFilter).select(function (kb) {
                return kb.keyCode;
            })
                .selectMany(function (keyCode) {
                    return Rx.Observable.interval(0, model.STEERING_SAMPLING_RATE)
                        .select(function () { return keyCode; })
                        .takeUntil(keyup.filter(steerLeftFilter))
                        .takeWhile(function () { return car.steering.angle > -(car.steering.maxAngle); });
                })
                .repeat();

            turnLeft.subscribe(function () {
                car.steering.turnLeft();
                scope.$apply();
            });

            var turnRight = keydown.filter(steerRightFilter).select(function (kb) {
                return kb.keyCode;
            })
                .selectMany(function (keyCode) {
                    return Rx.Observable.interval(0, model.STEERING_SAMPLING_RATE)
                        .select(function () { return keyCode; })
                        .takeUntil(keyup.filter(steerRightFilter))
                        .takeWhile(function () { return car.steering.angle < car.steering.maxAngle; });
                })
                .repeat();

            turnRight.subscribe(function () {
                car.steering.turnRight();
                scope.$apply();
            });

            var centerSteeringSubscription = function () {
                car.steering.center();
                scope.$apply();
            };

            keyup.filter(steerLeftFilter).subscribe(centerSteeringSubscription);
            keyup.filter(steerRightFilter).subscribe(centerSteeringSubscription);

            keyup.filter(gasKeyFilter).subscribe(function () {
                car.break();
                scope.$apply();

                eventBroadcast.carStops(car);

                socketService.send('carStop', { name: car.name});
            });
        }
    };
}]);

var setFrontWheelCenters = function (car, element) {
    var right = $('#rightFront', element);
    var left = $('#leftFront', element);

    car.rightTyreCenterY = Number(right.attr('y1')) + ((Number(right.attr('y2')) - Number(right.attr('y1'))) / 2);
    car.rightTyreCenterX = Number(right.attr('x1')) + ((Number(right.attr('x2')) - Number(right.attr('x1'))) / 2);

    car.leftTyreCenterY = Number(left.attr('y1')) + ((Number(left.attr('y2')) - Number(left.attr('y1'))) / 2);
    car.leftTyreCenterX = Number(left.attr('x1')) + ((Number(left.attr('x2')) - Number(left.attr('x1'))) / 2);
};

app.directive('remotecar', ['$templateCache', function ($templateCache) {
    return {
        templateNamespace: 'svg',
        restrict: 'E',
        replace: true,
        templateUrl: $templateCache.get('carTemplateOldSkool.html'),
        link: function (scope, element) {

            var car = scope.car;

            setFrontWheelCenters(car, element);
        }
    };
}]);

var moveToStartPos = function (car, movingElement) {
    var freeStartPos = $('[carstartpos=""]').first();

    freeStartPos.attr('carstartpos', car.name);

    var carMainRect = $('.carMainRect', movingElement);
    movingElement.carCenterX = Number(carMainRect.attr('x')) + (Number(carMainRect.attr('width')) / 2);
    movingElement.carCenterY = Number(carMainRect.attr('y')) + (Number(carMainRect.attr('height')) / 2);

    var newX = Number(freeStartPos.attr('cx')) - movingElement.carCenterX;
    var newY = Number(freeStartPos.attr('cy')) - movingElement.carCenterY;

    //These are dynamically added helper properties. With these I don't need to parse the current value
    //when I change the transform value.
    car.X = newX;
    car.Y = newY;

    movingElement.attr('transform', 'translate ( ' + newX + ' ' + newY + ')');
};

app.directive('movingobject', ['observeOnScope', 'checkpointService', 'socketService', 'eventBroadcast',
    function(observeOnScope, checkpointService, socketService, eventBroadcast) {

        return {
            link: function (scope, element) {
                var currX, currY, newX, newY, newAngle;
                var prevAngle = 0;
                var angleReturnedToZero = function () {
                    return scope.car.steering.angle === 0 && prevAngle !== 0;
                };
                var steeringTurnedTheOtherWay = function () {
                    return Math.abs(scope.car.steering.angle) < prevAngle;
                };
                var steeringStartedChanging = function () {
                    return scope.car.steering.angle !== 0 && prevAngle === 0;
                };

                moveToStartPos(scope.car, element);

                scope.car.direction = 0;

                var revs = observeOnScope(scope, 'car.engine.revs')
                    .filter(function (revs) { return revs.newValue > 0; })
                    .take(1)
                    .selectMany(function () {
                        return Rx.Observable.interval(model.MOVING_RATE)
                            .takeWhile(function () {
                                return  checkpointService.isRaceOn() &&
                                    scope.car.gearbox.currentGear > 0 &&
                                    scope.car.engine.revs > 0 &&
                                    scope.car.fuelTank.fuelLeft > 0 });
                    })
                    .repeat();

                revs.sample(model.STEERING_SAMPLING_RATE).subscribe(function () {
                    newAngle = scope.car.direction + scope.car.steering.angle;

                    if (newAngle > 360) { newAngle = newAngle - 360; }
                    if (newAngle < -360) { newAngle = newAngle + 360; }

                    if (angleReturnedToZero() ||
                        steeringTurnedTheOtherWay() ||
                        steeringStartedChanging()) {
                            socketService.send('carMoves', { name: scope.car.name, angle: scope.car.steering.angle} );
                    }

                    scope.car.direction = newAngle;

                    prevAngle = Math.abs(scope.car.steering.angle);
                });

                revs.takeWhile(function () {
                    return scope.car.currentPresumedSpeed === 0;
                })
                    .repeat()
                    .subscribe(function () {
                        console.log('car start');
                        socketService.send('carStart', { name: scope.car.name, X: scope.car.X, Y: scope.car.Y, direction: scope.car.direction} );
                    });

                revs.subscribe(function () {
                    currX = scope.car.X;
                    currY = scope.car.Y;

                    newY = (Math.sin(toRadians(scope.car.direction)) * model.UNIT_OF_MOVEMENT) + currY;
                    newX = (Math.cos(toRadians(scope.car.direction)) * model.UNIT_OF_MOVEMENT) + currX;

                    element.attr('transform', 'translate ( ' + newX + ' ' + newY + ')');

                    scope.car.X = newX;
                    scope.car.Y = newY;

                    eventBroadcast.carMoved({ car: scope.car, x: currX, y: currY, oldX: newX, oldY: newY });

                    scope.car.actualSpeed = Math.sqrt(Math.pow(Math.abs(newX - currX), 2) + Math.pow(Math.abs(newY - currY), 2));

                    scope.car.setCurrentSpeed();
                    scope.car.fuelTank.consumeFuel(0.1);

                    scope.$apply();
                });
            }
        };
    }]);

app.directive('moveremotely', ['socketService', function(socketService) {
    return {
        link: function (scope, element) {
            var thisCarFilter = function (car) { return car.name === scope.car.name; }
            var newX;
            var newY;
            var steeringSubject = new Rx.Subject();
            var steeringCenteredSubject = new Rx.Subject();
            var newAngle;
            var currX;
            var currY;

            moveToStartPos(scope.car, element);

            scope.car.direction = 0;
            scope.car.steering.angle = 0;

            var moving = socketService.carStartSub.filter(thisCarFilter)
                .take(1)
                .selectMany(function () {
                    return Rx.Observable.interval(model.MOVING_RATE)
                        .takeUntil(socketService.carStopSub.filter(thisCarFilter));
                })
                .repeat();

            moving.sample(model.STEERING_SAMPLING_RATE).subscribe(function () {
                newAngle = scope.car.direction + scope.car.steering.angle;

                if (newAngle > 360) { newAngle = newAngle - 360; }
                if (newAngle < -360) { newAngle = newAngle + 360; }

                scope.car.direction = newAngle;
            });

            moving.subscribe(function () {
                currX = scope.car.X;
                currY = scope.car.Y;

                newY = (Math.sin(toRadians(scope.car.direction)) * model.UNIT_OF_MOVEMENT) + scope.car.Y;
                newX = (Math.cos(toRadians(scope.car.direction)) * model.UNIT_OF_MOVEMENT) + scope.car.X;

                element.attr('transform', 'translate ( ' + newX + ' ' + newY + ')');

                scope.car.X = newX;
                scope.car.Y = newY;

                scope.car.actualSpeed = Math.sqrt(Math.pow(Math.abs(newX - currX), 2) + Math.pow(Math.abs(newY - currY), 2));

                scope.$apply();
            });

            var turning = steeringSubject
                .take(1)
                .selectMany(function (remoteMoves) {
                    return Rx.Observable.interval(0, model.STEERING_SAMPLING_RATE)
                        .select(function () { return remoteMoves; })
                        .takeUntil(steeringCenteredSubject)
                        .takeWhile(function () { return Math.abs(scope.car.steering.angle) < scope.car.steering.maxAngle; });
                })
                .repeat();

            turning.subscribe(function (remoteMoves) {
                if (remoteMoves.angle > 0) {
                    scope.car.steering.turnRight();
                }
                else if (remoteMoves.angle < 0) {
                    scope.car.steering.turnLeft();
                }
            });

            socketService.carMovesSub.filter(thisCarFilter).subscribe(function (remoteMoves) {
                if (remoteMoves.angle === 0) {
                    scope.car.steering.center();

                    steeringCenteredSubject.onNext(remoteMoves);
                } else {
                    scope.car.steering.angle = scope.car.steering.angle + remoteMoves.angle;

                    steeringSubject.onNext(remoteMoves);
                }
            });

            socketService.syncCarPosSub.filter(thisCarFilter).subscribe(function (car) {
                scope.car.X = car.X;
                scope.car.Y = car.Y;
                scope.car.direction = car.direction;
                scope.car.steering.angle = car.steering.angle;
                scope.$apply();
            });
        }
    };
}]);


app.directive('checkpoint', function () {
    return {
        restrict: 'A',
        replace: true,
        transclude: true,
        controller: 'cpController'
    };
});

app.directive('carstartpos', function () {
    return {
        restrict: 'A',
        replace: true,
        link: function (scope, element) {
            element.hide();
        }
    };
});

app.directive('lapcount',  function () {
    return {
        restrict: 'E',
        replace: true,
        scope: {
            carname: '=carname',
            isremote: '=isremote'
        },
        template: '<div>' +
                    '<div>lap:{{lap}}. last:{{lastLapTime}}s. best:{{bestLapTime}}</div>' +
                    '<div ng-repeat="checkpointtime in checkpointtimes">' +
                        '<div>{{checkpointtime}}</div>' +
                    '</div>' +
                  '</div>',
        controller: 'lapCountControllerSelector'
    };
});

app.directive('pit', ['eventBroadcast', function(eventBroadcast) {
   return {
       restrict: 'E',
       replace: true,
       templateUrl: './html/pit.html',
       link: function (scope, element) {

           var isInPit = function (car) {
               var normalizedPos = getNormalizedCarPos(car.X, car.Y);
               return normalizedPos.X + 20 > 135 && normalizedPos.X + 20 < 185 &&
                   normalizedPos.Y + 30 > 350 && normalizedPos.Y + 30 < 450;
           };

           var observer;
           var carMovedObs = Rx.Observable.create(function (o) {
                observer = o;
           });

           eventBroadcast.oncarMoved(scope, function(data) {
               if (observer) {
                   observer.onNext(data);
               }
           });

           eventBroadcast.onCarStops(scope, function (car) {
                if (isInPit(car)) {
                    var timestamp = new Date();
                    Rx.Observable.interval(100).takeWhile(function () {
                        return isInPit(car) && car.fuelTank.fuelLeft < car.fuelTank.tankSize;
                    }).takeUntil(carMovedObs.filter(function (data) {
                        console.log('car moved');
                        return data.car.name === car.name;
                    })).subscribe(function () {
                        car.fuelTank.refuel(0.5);
                        scope.$apply();
                        console.log(timestamp);
                    }, function () { console.log('completed'); });
                }
           });
       }
   };
}]);