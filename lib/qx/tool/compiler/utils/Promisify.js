/* ************************************************************************
 *
 *    qooxdoo-compiler - node.js based replacement for the Qooxdoo python
 *    toolchain
 *
 *    https://github.com/qooxdoo/qooxdoo-compiler
 *
 *    Copyright:
 *      2011-2017 Zenesis Limited, http://www.zenesis.com
 *
 *    License:
 *      MIT: https://opensource.org/licenses/MIT
 *
 *      This software is provided under the same licensing terms as Qooxdoo,
 *      please see the LICENSE file in the Qooxdoo project's top-level directory
 *      for details.
 *
 *    Authors:
 *      * John Spackman (john.spackman@zenesis.com, @johnspackman)
 *
 * *********************************************************************** */

require("qooxdoo");
const nodePromisify = require("util").promisify;

qx.Class.define("qx.tool.compiler.utils.Promisify", {
  statics: {
    MAGIC_KEY: "__isPromisified__",
    IGNORED_PROPS: /^(?:length|name|arguments|caller|callee|prototype|__isPromisified__)$/,
    
    promisifyAll: function(target, fn) {
      Object.getOwnPropertyNames(target).forEach(key => {
        if (this.IGNORED_PROPS.test(key) || (fn && fn(key, target) === false)) {
          return;
        }
        if (typeof target[key] !== "function") {
          return;
        }
        if (this.isPromisified(target[key])) {
          return;
        }

        var promisifiedKey = key + "Async";

        target[promisifiedKey] = this.promisify(target[key]);

        [key, promisifiedKey].forEach(key => {
          Object.defineProperty(target[key], this.MAGIC_KEY, {
            value: true,
            configurable: true,
            enumerable: false,
            writable: true
          });
        });
      });

      return target;
    },
    
    isPromisified: function(fn) {
      try {
        return fn[this.MAGIC_KEY] === true;
      } catch (e) {
        return false;
      }
    },
    
    promisify: function(fn, context) {
      fn = nodePromisify(fn);
      if (context) {
        fn = fn.bind(context);
      }
      return fn;
    },
    
    call: function(fn) {
      return new Promise((resolve, reject) => {
        fn((err, ...args) => {
          if (err) {
            reject(err);
          } else {
            resolve(...args);
          }
        });
      });
    },
    
    fs: null,
    
    each: async function(coll, fn) {
      return qx.tool.compiler.utils.Promisify.eachOf(coll, fn);
    },
    
    forEachOf: async function(coll, fn) {
      return qx.tool.compiler.utils.Promisify.eachOf(coll, fn);
    },
    
    eachOf: async function(coll, fn) {
      let promises = Object.keys(coll).map(key => fn(coll[key], key));
      return qx.Promise.all(promises);
    },
    
    eachSeries: function(coll, fn) {
      return qx.tool.compiler.utils.Promisify.eachOfSeries(coll, fn);
    },
    
    forEachOfSeries: function(coll, fn) {
      return qx.tool.compiler.utils.Promisify.eachOfSeries(coll, fn);
    },
    
    eachOfSeries: function(coll, fn) {
      let keys = Object.keys(coll);
      let index = 0;
      function next() {
        if (index == keys.length) {
          return qx.Promise.resolve();
        }
        let key = keys[index];
        index++;
        var result = fn(coll[key], key);
        return qx.Promise.resolve(result)
          .then(next);
      }
      return next();
    }
    
  },
  
  defer: function(statics) {
    statics.fs = statics.promisifyAll(require("fs"), function(key, fs) {
      return key !== "SyncWriteStream";
    });
  }
});
