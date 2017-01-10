/*jslint nomen: true */
/*global d3, jsSHA, global*/
;
(function () {
    "use strict";


    var baseUrl = "https://kt.125m125.de/api/",
        hashType = "SHA-256",
        maxSignatureOffset = 4 * 60 * 1000,
        dTime = 0,
        last = 0,
        hmac = function (text, key) {
            var shaObj = new jsSHA(hashType, "TEXT");
            shaObj.setHMACKey(key, "TEXT");
            shaObj.update(text);
            return shaObj.getHMAC("HEX");
        },
        paramsToQuery = function (params) {
            var result = "",
                sorted_keys = Object.keys(params).sort();
            sorted_keys.forEach(function (entry) {
                result += entry + "=" + params[entry] + "&";
            });
            if (result.length) {
                return result.slice(0, -1);
            }
            return result;
        },
        performRequest = function (method, type, suburl, params, token, primaryParam, callback) {
            var url;
            if (token) {
                if (last) {
                    if (last < new Date().getTime() - maxSignatureOffset) {
                        last = new Date().getTime() + maxSignatureOffset;
                    }
                    params.timestamp = last + dTime;
                } else {
                    params.timestamp = (new Date()).getTime() + dTime;
                }
                params.signature = hmac(paramsToQuery(params), token);
            }
            if (method === "GET") {
                url = baseUrl + suburl + "?" + paramsToQuery(params);
                d3[type](url, callback);
            } else {
                if (primaryParam) {
                    url = baseUrl + suburl + "?" + primaryParam + "=" + params[primaryParam];
                    delete params[primaryParam];
                } else {
                    url = baseUrl + suburl;
                }
                d3.request(url).header("Content-Type", "application/x-www-form-urlencoded").post(paramsToQuery(params), callback);
            }
        },
        syncTime = function () {
            var start = new Date();
            d3.request(baseUrl + "ping", function (response) {
                var end = new Date(),
                    servertime = new Date(parseInt(response.response, 10)),
                    delta = servertime.getTime() - (start.getTime() + end.getTime()) / 2;
                if (dTime === 0) {
                    dTime = Math.round(delta);
                } else {
                    dTime = Math.round((dTime + delta) / 2);
                }
                last = new Date().getTime() + maxSignatureOffset;
            });
        };

    function Kt(uid, tid, tkn) {
        var user = {
                "uid": uid,
                "tid": tid,
                "tkn": tkn
            },
            permissions;

        this.getPermissions = function (callback) {
            var start = new Date();
            performRequest("GET", "json", "permissions", {
                uid: user.uid,
                tid: user.tid
            }, user.tkn, false, callback);
        };


        this.getItems = function (callback) {
            var params = {};
            params = {
                uid: user.uid,
                tid: user.tid
            };
            performRequest("GET", "csv", "itemlist", params, user.tkn, false, callback);
        };
        this.getTrades = function (callback) {
            var params = {};
            params = {
                uid: user.uid,
                tid: user.tid
            };
            performRequest("GET", "csv", "trades", params, user.tkn, false, callback);
        };

        this.getHistory = function (item, limit, callback) {
            item = (typeof item === "string") ? item : item.id;
            d3.csv(baseUrl + "history?res=" + item + "&limit=" + limit, callback);
        };
        this.getPrice = function (item, callback) {
            this.getHistory(item, 1, function (data) {
                if (data.length > 0) {
                    callback(data[0].close);
                } else {
                    callback(-1);
                }
            });
        };

        this.getOrderBook = function (item, limit, summarize, callback) {
            item = (typeof item === "string") ? item : item.id;
            d3.csv(baseUrl + "order?res=" + item + "&limit=" + limit + "&summarize=" + summarize, callback);
        };
        this.getOrderBookPrice = function (item, buyOrSell, trumpSame, callback) {
            this.getOrderBook(item, 1, false, function (data) {
                var price = -1;
                data.forEach(function (entry) {
                    if (buyOrSell !== (entry.type === "buy")) {
                        price = entry.price;
                    } else if (trumpSame) {
                        if (buyOrSell) {
                            price = Math.max(price, Number(entry.price) + 0.01);
                        } else {
                            if (price === -1) {
                                price = Number(entry.price) - 0.01;
                            } else {
                                price = Math.min(price, Number(entry.price) - 0.01);
                            }
                        }
                    }
                });
                callback(price);
            });
        };

        this.getRecommendedPrice = function (item, buyOrSell, callback) {
            this.getOrderBookPrice(item, buyOrSell, true, function (result) {
                if (result !== -1) {
                    callback(result);
                } else {
                    this.getPrice(item, callback);
                }
            }.bind(this));
        };

        this.createTrade = function (buyOrSell, item, count, price, callback) {
            var params;
            item = (typeof item === "string") ? item : item.id;
            params = {
                "create": "create",
                "bs": (buyOrSell ? "buy" : "sell"),
                "item": item,
                "count": count,
                "price": price,
                "uid": user.uid,
                "tid": user.tid
            };
            performRequest("POST", false, "trades", params, user.tkn, "create", callback);
        };
        this.buy = function (item, count, price, callback) {
            this.createTrade(true, item, count, price, callback);
        };
        this.sell = function (item, count, price, callback) {
            this.createTrade(false, item, count, price, callback);
        };
        this.cancelTrade = function (trade, callback) {
            var params;
            trade = (typeof trade === "string") ? trade : trade.id;
            params = {
                "cancel": "cancel",
                "tradeid": trade,
                "uid": user.uid,
                "tid": user.tid
            };
            performRequest("POST", false, "trades", params, user.tkn, "cancel", callback);
        };
        this.takeout = function (trade, callback) {
            var params;
            trade = (typeof trade === "string") ? trade : trade.id;
            params = {
                "takeout": "takeout",
                "tradeid": trade,
                "uid": user.uid,
                "tid": user.tid
            };
            performRequest("POST", false, "trades", params, user.tkn, "takeout", callback);
        };
        this.syncTimeWithServer = syncTime;
    }
    window.Kt = Kt;
}());