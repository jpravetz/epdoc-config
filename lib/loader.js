/*************************************************************************
 * Copyright(c) 2012-2015 Jim Pravetz <jpravetz@epdoc.com>
 * May be freely distributed under the MIT license.
 **************************************************************************/

'use strict';

var Path = require('path');
var _ = require('underscore');


/**
 * Our static global variable, will contain the properties:
 *      env - The environment variable that was used to initialize the config settings
 *      config - The config object. Access this object using Config.get();
 *      files - The list of config files that were loaded
 */

var props = {};

// List of replacement RegEx to apply to all string values in the config file
var replaceRegEx = {};

/**
 * Call Config.init() to initialize and return config settings, reading from a list of config files,
 * with the last file in the list overwriting previous files.
 * Loads the default global.settings.json config file first.
 * Call this method only once. Thereafter, get the config using Config.get();
 * @param nodeEnv Environment NODE_ENV, usually one of development, production, staging, test.
 * @param configFileList List of config files to load. Paths should be absolute.
 * @param options { replace: { k1: v1, k2: v2 }, def: /path/to/configDef.js }
 * @returns The resultant config settings, resolved by loading from the list of config files.
 */
var init = function( nodeEnv, configFileList, options ) {

    options || ( options = {} );

    props.options = options;
    props.env = nodeEnv;
    props.config = {};
    props.files = [];
    props.toload = [];
    props.configDef = options.configDef;

    options.replace || ( options.replace = {} );
    for( var prop in options.replace ) {
        var v = "\\\$\\\{" + prop.toUpperCase() + "\\\}";
        replaceRegEx[prop] = new RegExp(v, 'g');
    }

    // Merge config files that were passed in
    if( _.isArray(configFileList) ) {
        for( var cdx = 0; cdx < configFileList.length; ++cdx ) {
            _add(configFileList[cdx], options);
        }
    } else {
        throw new Error("No config files specified");
    }

    // Now merge in any config files that were referenced _within_ the config files that were loaded.
    // Yes we do this after all previous configs have been loaded, and we do it in the order they are encountered.

    if( props.toload.length ) {
        for( var tdx = 0; tdx < props.toload.length; ++tdx ) {
            _add(props.toload[tdx], options);
        }
    }

    return {
        env: nodeEnv,
        get: get,
        files: files
    };
};
module.exports.init = init;

/**
 * Return the resultant config settings. Must call init() before calling this method.
 * @returns The resultant config settings, resolved by loading from the list of config files.
 */
function get() {
    _throwIfNotInitialized();
    return props.config;
};
module.exports.get = get;

/**
 * Extend the config object with properties from config
 * @param config {Object} Contains properties with which to extend the config object
 * @param opt_path {String} Used as 'path' property when calling files()
 * @param opt_name {String} Used as 'name' property when calling files()
 * @returns {Object} Returns the config object
 */
module.exports.extend = function( config, opt_path, opt_name ) {
    _merge(config, props.options);
    var fileObj = {
        name: opt_name,
        path: opt_path
    };
    props.files.push(fileObj);

    return props.config;
};

/**
 * @returns The env value that was used to initialze the data
 */
function env() {
    _throwIfNotInitialized();
    return props.env;
};
module.exports.env = env;


/**
 * Return a list of all the files that were loaded, in order, when building the config object
 * @returns The list of config files.
 */
function files() {
    _throwIfNotInitialized();
    return props.files;
};
module.exports.files = files;


function _throwIfNotInitialized() {
    if( !props.config ) {
        throw new Error('config-loader has not been initialized');
    }
}

/**
 * Private function to read a config file and merge it into the accumulated
 * config object.
 * @param filepath
 */
function _add( filepath, options ) {
    try {
        var config = require(filepath);
        if( config['defaults'] || config[props.env] ) {
            _merge(config['defaults'], options);
            if( props.env ) {
                _merge(config[props.env], options);
                var fileObj = {
                    name: ( config[props.env] && config[props.env].name ) ? config[props.env].name :
                        ( config['defaults'] ? config['defaults'].name : undefined ),
                    path: filepath
                };
                props.files.push(fileObj);
            }
        } else if( options.flat && config['_type'] !== 'tree' ) {
            // We support flat files that do not have 'default', 'production' and 'development' subsections
            _merge(config, options);
            props.files.push({path: filepath});
        }
    } catch( e ) {
        console.log("Error reading config file: %s", e);
        throw new Error(e);
    }
}


/**
 *
 * @param obj
 * @private
 */
function _merge( obj, options ) {
    if( obj ) {
        for( var prop in obj ) {
            var value = _recursiveReplace(obj[prop], options);
            if( prop === 'configExt' ) {
                if( _.isArray(value) ) {
                    props.toload = props.toload.concat(value);
                } else if( _.isString(value) ) {
                    props.toload.push(value);
                }
            } else {
                if( options.extend && _.isObject(props.config[prop]) && !_.isArray(props.config[prop]) && _.isObject(value)  && !_.isArray(value) ) {
                    props.config[prop] = _.extend(props.config[prop],value);
                } else {
                    props.config[prop] = value;
                }
            }
        }
    }
};

function _recursiveReplace( value, options ) {
    if( _.isString(value) ) {
        for( var prop in replaceRegEx ) {
            value = value.replace(replaceRegEx[prop], options.replace[prop]);
        }
    } else if( _.isObject(value) ) {
        _.each(value, function( v, k ) {
            value[k] = _recursiveReplace(v, options);
        });
    }
    return value;
}


module.exports.writer = function( format, ofile, log, callback ) {
    var writer = require('./writer');
    writer(format, ofile, props.configDef, props.config, log, callback);
    //writer(this,Array.prototype.slice.call(arguments));
};

module.exports.filter = function() {
    var filter = require('./filter');
    return filter(props.configDef, props.config);
};

module.exports.default = function( prop ) {
    var getDefault = require('./default');
    return getDefault(props.configDef, prop);
};
