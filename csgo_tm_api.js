"use strict";

var got = require('got'),
    util = require('util'),
    extend = require('extend'),
    Bottleneck = require("bottleneck"),
    parseCSV = require('csv-parse');

/**
 * API error
 */
class CSGOtmAPIError extends Error{
    constructor(message) {
        super(message);
        this.name = this.constructor.name;
    }
}


/**
 * API
 * https://csgo.tm/docs/
 */
class CSGOtmAPI {
    /**
     * @param {Object} options
     *
     * {String}     [options.apiKey=false] API key (required)
     * {Boolean}    [options.useLimiter=true] Using request limiter
     * {Object}     [options.limiterOptions={}] Parameters for 'bottleneck' module
     *
     * @throws {CSGOtmAPIError}
     */
    constructor (options) {
        options = options || {};
        if (!options.apiKey) {
            throw new CSGOtmAPIError('API key required');
        }

        this.options = {};
        extend(this.options, options, {
            useLimiter: true,
            limiterOptions: {
                concurrent: 1, // 1 request at time
                minTime: 250,  // Max 5 requests per seconds
                highWater: -1,
                strategy: Bottleneck.strategy.LEAK,
                rejectOnDrop: true
            }
        });

        this.baseURI = 'https://market.csgo.com/api/';
        this.availableLanguages = ['en', 'ru'];

        /**
         *  CSGO.TM API has a limit of 5 requests per second.
         *  If you violate this restriction, your API key will become invalid
         */
        if (this.options.useLimiter) {
            let limiterOptions = this.options.limiterOptions;
            this.limiter = new Bottleneck(
                limiterOptions.concurrent,
                limiterOptions.minTime,
                limiterOptions.highWater,
                limiterOptions.strategy,
                limiterOptions.rejectOnDrop
            );
        }
    }

    /**
     * JSON request
     *
     * @param url
     * @param {Object} gotOptions Options for 'got' module
     *
     * @returns {Promise}
     */
    static requestJSON(url, gotOptions = {}) {
        gotOptions = gotOptions || {};
        gotOptions.json = true;

        return new Promise((resolve, reject) => {
            got(url, gotOptions).then(response => {
                let body = response.body;
                if (body.error) {
                    throw new CSGOtmAPIError(body.error);
                }
                else {
                    resolve(body);
                }
            }).catch(error => {
                reject(error);
            });
        });
    }

    /**
     * Get current database file information
     *
     * @param {Object} gotOptions Options for 'got' module
     *
     * @returns {Promise}
     */
    static itemDbCurrent(gotOptions = {}) {
        let url = 'https://market.csgo.com/itemdb/current_730.json';
        return CSGOtmAPI.requestJSON(url, gotOptions);
    }

    /**
     * Get current database file data
     *
     * @param {String} dbName
     * @param {Object} gotOptions Options for 'got' module
     *
     * @returns {Promise}
     */
    static itemDb(dbName, gotOptions = {}) {
        let url = 'https://market.csgo.com/itemdb/' + dbName;
        return new Promise((resolve, reject) => {
            got(url, gotOptions).then(response => {
                parseCSV(
                    response.body,
                    {
                        columns: true,
                        delimiter: ';'
                    },
                    function(err, data){
                        if (err) {
                            reject(err);
                        }
                        else {
                            resolve(data);
                        }
                    }
                );
            }).catch(error => {
                reject(error);
            });
        });
    }

    /**
     * Get list of the last 50 purchases
     *
     * @param {Object} gotOptions Options for 'got' module
     *
     * @returns {Promise}
     */
    static history(gotOptions = {}) {
        let url = 'https://market.csgo.com/history/json/';
        return CSGOtmAPI.requestJSON(url, gotOptions);
    }

    /**
     * Format item to needed query string
     *
     * @param {Object} item
     * @param {String} symbol
     *
     * @returns {string}
     */
    static formatItem(item, symbol = '_') {
        item = item || {};

        // For different property names in API
        let classId = item.i_classid || item.classid || item.classId;
        let instanceId = item.i_classid || item.instanceid || item.instanceId;

        classId = String(classId);
        instanceId = String(instanceId);

        return classId + symbol + instanceId;
    }

    /**
     * Limit requests, if need
     *
     * @param {Function} callback returning {Promise}
     *
     * @returns {Promise}
     */
    limitRequest(callback) {
        if (this.options.useLimiter) {
            return this.limiter.schedule(callback);
        }
        else {
            return callback();
        }
    }

    /**
     * Simple API call with key
     *
     * @param {String} method
     * @param {Object} gotOptions
     *
     * @returns {Promise}
     */
    callMethodWithKey(method, gotOptions = {}) {
        let url = this.baseURI + method + '/?key=' + this.options.apiKey;
        return this.limitRequest(() => {
            return CSGOtmAPI.requestJSON(url, gotOptions);
        });
    }


    /**
     * Simple API call with added item url
     *
     * @param {Object} item
     * @param {String} method
     * @param {Object}gotOptions
     *
     * @returns {Promise}
     */
    callItemMethod(item, method, gotOptions = {}) {
        method = method + CSGOtmAPI.formatItem(item);
        return this.callMethodWithKey(method, gotOptions);
    }

    /**
     * -------------------------------------
     * Account methods
     * -------------------------------------
     */


    /**
     * Getting the Steam inventory, only those items that you have not already put up for sale
     *
     * @param {Object} gotOptions Options for 'got' module
     *
     * @returns {Promise}
     */
    accountGetSteamInventory(gotOptions = {}) {
        return this.callMethodWithKey('GetInv', gotOptions);
    }

    /**
     * Getting the info about items in trades
     *
     * @param {Object} gotOptions Options for 'got' module
     *
     * @returns {Promise}
     */
    accountGetTrades(gotOptions = {}) {
        return this.callMethodWithKey('Trades', gotOptions);
    }

    /**
     * Get account balance
     *
     * @param {Object} gotOptions Options for 'got' module
     *
     * @returns {Promise}
     */
    accountGetMoney(gotOptions = {}) {
        return this.callMethodWithKey('GetMoney', gotOptions);
    }

    /**
     * Ping that you in online
     *
     * @param {Object} gotOptions Options for 'got' module
     *
     * @returns {Promise}
     */
    accountPingPong(gotOptions = {}) {
        return this.callMethodWithKey('PingPong', gotOptions);
    }

    /**
     * Stop your trades
     *
     * @param {Object} gotOptions Options for 'got' module
     *
     * @returns {Promise}
     */
    accountGoOffline(gotOptions = {}) {
        return this.callMethodWithKey('GoOffline', gotOptions);
    }

    /**
     * Set token
     *
     * @param {String} token from steam trade url
     * @param {Object} gotOptions Options for 'got' module
     *
     * @returns {Promise}
     */
    accountSetToken(token, gotOptions = {}) {
        let method = this.baseURI + 'SetToken/' + token;
        return this.callMethodWithKey(method, gotOptions);
    }

    /**
     * Get token
     *
     * @param {Object} gotOptions Options for 'got' module
     *
     * @returns {Promise}
     */
    accountGetToken(gotOptions = {}) {
        return this.callMethodWithKey('GetToken', gotOptions);
    }

    /**
     * Get key for auth on websockets
     *
     * @param {Object} gotOptions Options for 'got' module
     *
     * @returns {Promise}
     */
    accountGetWSAuth(gotOptions = {}) {
        return this.callMethodWithKey('GetWSAuth', gotOptions);
    }

    /**
     * Update cache of steam inventory
     *
     * @param {Object} gotOptions Options for 'got' module
     *
     * @returns {Promise}
     */
    accountUpdateInventory(gotOptions = {}) {
        return this.callMethodWithKey('UpdateInventory', gotOptions);
    }

    /**
     * Getting cache status of inventory
     *
     * @param {Object} gotOptions Options for 'got' module
     *
     * @returns {Promise}
     */
    accountGetCacheInfoInventory(gotOptions = {}) {
        return this.callMethodWithKey('InventoryItems', gotOptions);
    }

    /**
     * Getting operation history of period
     *
     * @param {Date} from
     * @param {Date} to
     * @param {Object} gotOptions Options for 'got' module
     *
     * @returns {Promise}
     */
    accountGetOperationHistory(from, to, gotOptions = {}) {
        let method = 'OperationHistory/%s/%s';
        let fromUnixtime = Math.floor(from.getTime() / 1000);
        let toUnixtime = Math.floor(to.getTime() / 1000);

        method = util.format(method, fromUnixtime, toUnixtime);
        return this.callMethodWithKey(method, gotOptions);
    }

    /**
     * Getting discounts
     *
     * @param {Object} gotOptions Options for 'got' module
     *
     * @returns {Promise}
     */
    accountGetDiscounts(gotOptions = {}) {
        return this.callMethodWithKey('GetDiscounts', gotOptions);
    }

    /**
     * Getting counters from https://market.csgo.com/sell/
     *
     * @param {Object} gotOptions Options for 'got' module
     *
     * @returns {Promise}
     */
    accountGetCounters(gotOptions = {}) {
        return this.callMethodWithKey('GetCounters', gotOptions);
    }

    /**
     * Getting items of profile with hash
     *
     * @param {String} hash
     * @param {Object} gotOptions Options for 'got' module
     *
     * @returns {Promise}
     */
    accountGetProfileItems(hash, gotOptions = {}) {
        return this.callMethodWithKey('GetProfileItems', gotOptions);
    }

    /**
     * Getting items from sell offers
     *
     * @param {Object} gotOptions Options for 'got' module
     *
     * @returns {Promise}
     */
    accountGetItemsSellOffers(gotOptions = {}) {
        return this.callMethodWithKey('GetMySellOffers', gotOptions);
    }

    /**
     * Get a list of items that have been sold and must be passed to the market bot using the ItemRequest method.
     *
     * @param {Object} gotOptions Options for 'got' module
     *
     * @returns {Promise}
     */
    accountGetItemsToGive(gotOptions = {}) {
        return this.callMethodWithKey('GetItemsToGive', gotOptions);
    }


    /**
     * -------------------------------------
     * Items methods
     * -------------------------------------
     */

    /**
     * Get item info
     *
     * @param {Object} item
     * @param {Object} gotOptions Options for 'got' module
     *
     * @returns {Promise}
     */
    itemGetInfo(item, gotOptions = {}) {
        let url = 'ItemInfo/%s_%s/%s';
        item = item || {};
        item.language = item.language || 'en';

        if (this.availableLanguages.indexOf(item.language) === -1) {
            item.language = this.availableLanguages[0];
        }

        url = util.format(url, item.classId, item.instanceId, item.language);
        return this.callMethodWithKey(url, gotOptions);
    }

    /**
     * Get item history
     *
     * @param {Object} item
     * @param {Object} gotOptions Options for 'got' module
     *
     * @returns {Promise}
     */
    itemGetHistory(item, gotOptions = {}) {
        return this.callItemMethod(item, 'ItemHistory', gotOptions);
    }

    /**
     * Get item hash of 'Float Value'
     *
     * @param {Object} item
     * @param {Object} gotOptions Options for 'got' module
     *
     * @returns {Promise}
     */
    itemGetFloatHash(item, gotOptions = {}) {
        return this.callItemMethod(item, 'GetFloatHash', gotOptions);
    }

    /**
     * Get item sell offers
     *
     * @param {Object} item
     * @param {Object} gotOptions Options for 'got' module
     *
     * @returns {Promise}
     */
    itemGetSellOffers(item, gotOptions = {}) {
        return this.callItemMethod(item, 'SellOffers', gotOptions);
    }

    /**
     * Get item bet sell offer
     *
     * @param {Object} item
     * @param {Object} gotOptions Options for 'got' module
     *
     * @returns {Promise}
     */
    itemGetBestSellOffer(item, gotOptions = {}) {
        return this.callItemMethod(item, 'BestSellOffer', gotOptions);
    }

    /**
     * Get item buy offers
     *
     * @param {Object} item
     * @param {Object} gotOptions Options for 'got' module
     *
     * @returns {Promise}
     */
    itemGetBuyOffers(item, gotOptions = {}) {
        return this.callItemMethod(item, 'BuyOffers', gotOptions);
    }

    /**
     * Get item best buy offer
     *
     * @param {Object} item
     * @param {Object} gotOptions Options for 'got' module
     *
     * @returns {Promise}
     */
    itemGetBestBuyOffer(item, gotOptions = {}) {
        return this.callItemMethod(item, 'BestBuyOffer', gotOptions);
    }

    /**
     * Get item description for method 'buy'
     *
     * @param {Object} item
     * @param {Object} gotOptions Options for 'got' module
     *
     * @returns {Promise}
     */
    itemGetDescription(item, gotOptions = {}) {
        return this.callItemMethod(item, 'GetItemDescription', gotOptions);
    }

    /**
     * Available types of 'SELL' and 'BUY' param in 'MassInfo' request
     * @returns {{NOTHING: number, TOP_50_SUGGESTIONS: number, TOP_SUGGESTION: number}}
     */
    static get MASS_INFO_SELL_BUY() {
        return {
            NOTHING: 0,
            TOP_50_SUGGESTIONS: 1,
            TOP_SUGGESTION: 2
        };
    };

    /**
     * Available types of 'HISTORY' param in 'MassInfo' request
     * @returns {{NOTHING: number, LAST_100_SELLS: number, LAST_10_SELLS: number}}
     */
    static get MASS_INFO_HISTORY() {
        return {
            NOTHING: 0,
            LAST_100_SELLS: 1,
            LAST_10_SELLS: 2
        };
    };

    /**
     * Available types of 'INFO' param in 'MassInfo' request
     * @returns {{NOTHING: number, BASE: number, EXTENDED: number, MAXIMUM: number}}
     */
    static get MASS_INFO_INFO() {
        return {
            NOTHING: 0,
            BASE: 1,
            EXTENDED: 2,
            MAXIMUM: 3
        };
    };

    /**
     * Getting more info about item
     *
     * @param {Array|Object} items One item or array of items
     * @param {Object} params Request params
     * @param {Object} gotOptions Options for 'got' module
     *
     * @returns {Promise}
     */
    itemMassInfo(items, params = {}, gotOptions = {}) {
        // [SELL], [BUY], [HISTORY], [INFO]
        let url = this.baseURI + 'MassInfo/%s/%s/%s/%s?key=%s';

        if (!Array.isArray(items)) {
            items = [items];
        }

        params = params || {};
        params.sell = params.sell || CSGOtmAPI.MASS_INFO_SELL_BUY.NOTHING;
        params.buy = params.buy || CSGOtmAPI.MASS_INFO_SELL_BUY.NOTHING;
        params.history = params.history || CSGOtmAPI.MASS_INFO_HISTORY.NOTHING;
        params.info = params.info || CSGOtmAPI.MASS_INFO_INFO.BASE;

        url = util.format(url,
            params.sell,
            params.buy,
            params.history,
            params.info,
            this.options.apiKey
        );

        let list = [];
        items.forEach(item => {
            list.push(CSGOtmAPI.formatItem(item));
        });

        gotOptions.body = {
            list: list
        };

        return this.limitRequest(() => {
            return new Promise((resolve, reject) => {
                got(url, gotOptions).then(response => {
                    let body = JSON.parse(response.body);
                    if (body.error) {
                        throw new CSGOtmAPIError(body.error);
                    }
                    else {
                        resolve(body);
                    }
                }).catch(error => {
                    reject(error);
                });
            });
        });
    }

    /**
     * -------------------------------------
     * Sell methods
     * -------------------------------------
     */

    /**
     * Creating new sell
     *
     * @param item
     * @param {Number} price
     * @param {Object} gotOptions Options for 'got' module
     *
     * @returns {Promise}
     */
    sellCreate(item, price, gotOptions = {}) {
        let url = 'SetPrice/new_' + CSGOtmAPI.formatItem(item);
        price = parseInt(price);
        url = url + '/' + String(price);
        return this.callMethodWithKey(url, gotOptions);
    }

    /**
     * Updating price of sell
     *
     * @param {String} itemId Item ui_id from 'Trades' method
     * @param {Number} price
     * @param {Object} gotOptions Options for 'got' module
     *
     * @returns {Promise}
     */
    sellUpdatePrice(itemId, price, gotOptions = {}) {
        let url = 'SetPrice/' + String(itemId);
        price = parseInt(price);
        url = url + '/' + String(price);
        return this.callMethodWithKey(url, gotOptions);
    }

    /**
     * Available types of \sellCreateTradeRequest\ method
     * @returns {{IN: string, OUT: string}}
     */
    static get CREATE_TRADE_REQUEST_TYPE() {
        return {
            IN: 'in',
            OUT: 'out'
        };
    };

    /**
     * Create trade request
     *
     * @param {String} botId Bot ui_bid from 'Trades' method (with ui_status = 4)
     * @param {String} type CREATE_TRADE_REQUEST_TYPE type
     * @param {Object} gotOptions Options for 'got' module
     *
     * @returns {Promise}
     */
    sellCreateTradeRequest(botId, type = 'out', gotOptions = {}) {
        let types = CSGOtmAPI.CREATE_TRADE_REQUEST_TYPE;
        if ([types.IN, types.OUT].indexOf(type) === -1) {
            type = types.OUT;
        }

        let url = 'ItemRequest/' + type + '/' + String(botId);
        return this.callMethodWithKey(url, gotOptions);
    }

    /**
     * Getting market trades
     *
     * @param {Object} gotOptions Options for 'got' module
     *
     * @returns {Promise}
     */
    sellGetMarketTrades(gotOptions = {}) {
        return this.callMethodWithKey('MarketTrades', gotOptions);
    }

    /**
     * Massive update prices
     *
     * @param item
     * @param {Number} price
     * @param {Object} gotOptions Options for 'got' module
     *
     * @returns {Promise}
     */
    sellMassUpdatePrice(item, price, gotOptions = {}) {
        let url = 'MassSetPrice/' + CSGOtmAPI.formatItem(item);
        price = parseInt(price);
        url = url + '/' + String(price);
        return this.callMethodWithKey(url, gotOptions);
    }
}

module.exports.API = CSGOtmAPI;
module.exports.CSGOtmAPIError = CSGOtmAPIError;


