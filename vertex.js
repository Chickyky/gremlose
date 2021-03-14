const async = require('async');
const _ = require('lodash');
const gremlin = require('gremlin');
const flatten = require('flat');
const unflatten = require('flat').unflatten;

const { t: { id } } = gremlin.process;
const { cardinality: { single, list } } = gremlin.process;

const helper = require('./helper');

const removeDefaultOtps = {
  multi: false
}

class GremloseVertexModel {
  #g = null
  #client = null

  constructor (graphInstance, client, modelName) {
    this.#g = graphInstance;
    this.#client = client;
    this._modelName = modelName;
  }

  /* Create */

  async createVertex (props = {}, meta = {}) {
    const _label = this._modelName;
    let chain = this.#g.addV(_label);
    chain = helper.addProps(chain, props, 'vertex', meta);

    const vertex = await chain.next();

    return vertex;
  }

  /* Query */

  findChain (props = {}) {
    const _label = this._modelName;
    const _props = flatten(props);
    let chain = this.#g.V().hasLabel(_label);

    for (let key in _props) {
      chain = chain.has(_label, key, _props[key]);
    }

    return chain;
  }

  async find (props = {}) {
    const _chain = this.findChain(props);
    const list = await _chain.toList();
    return list;
  }

  async findOne (props = {}) {
    let _chain = this.findChain(props);
    _chain = _chain.limit(1);
    const list = await _chain.toList();

    return list && list[0] ? list[0] : null;
  }

  async getJsonById (idVertex) {
    const _label = this._modelName;
    const query = `g.V(${helper.stringifyValue(idVertex)}).hasLabel('${_label}')`;
    const result = await this.#client.submit(query, {});

    if (result && result._items && result._items[0]) {
      return result._items[0];
    }

    return null;
  }

  /* Update */

  async remove (props = {}, opts = {}) {
    opts = Object.assign({}, removeDefaultOtps, opts);
    let _chain = this.findChain(props);

    if (!opts.multi) _chain = _chain.limit(1);

    _chain = _chain.drop();

    return _chain.next();
  }

  static async removeAll (gInstance) {
    return gInstance.V().drop().next();
  }
}

module.exports = GremloseVertexModel;
