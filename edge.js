const async = require('async');
const _ = require('lodash');
const gremlin = require('gremlin');
const flatten = require('flat');
const unflatten = require('flat').unflatten;

const { t: { id } } = gremlin.process;
const { cardinality: { single, list } } = gremlin.process;

const helper = require('./helper');

class GremloseEdge {
  #g = null;
  #client = null;

  constructor (graphInstance, client, modelName) {
    this.#g = graphInstance;
    this.#client = client;
    this._modelName = modelName;
  }

  async createEdgeById(idSource, idTarget, props = {}, meta = {}) {
    const _label = this._modelName;
    const asTo = `from_${idTarget}`;

    let _chain = this.#g.V(idTarget).as(asTo)
      .V(idSource).addE(_label).to(asTo);
    _chain = helper.addProps(_chain, props, 'edge', meta);

    const edge = await _chain.next();
    return edge;
  }

  async createEdge (outV, inV, props = {}, meta = {}) {
    const { id: idSource } = outV;
    const { id: idTarget } = inV;

    return this.createEdgeById(idSource, idTarget, props, meta);
  }

  async getJsonById (idEdge) {
    const _label = this._modelName;
    const query = `g.E(${helper.stringifyValue(idEdge)}).hasLabel('${_label}')`;
    const result = await this.#client.submit(query, {});

    if (result && result._items && result._items[0]) {
      return result._items[0];
    }

    return null;
  }

  async removeProp (edge, propKey) {
    const _label = this._modelName;
    return this.#g.E(edge).hasLabel(_label).properties(propKey).drop().next();
  }

  static async removeAll (gInstance) {
    return gInstance.E().drop().next();
  }
}

module.exports = GremloseEdge;
