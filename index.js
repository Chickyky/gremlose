const async = require('async');
const _ = require('lodash');
const flatten = require('flat');
const unflatten = flatten.unflatten;
const gremlin = require('gremlin');
const util = require('util');

const traversal = gremlin.process.AnonymousTraversalSource.traversal;
const DriverRemoteConnection = gremlin.driver.DriverRemoteConnection;

const { cardinality: { single, list } } = gremlin.process;

const GremloseVertex = require('./vertex');
const GremloseEdge = require('./edge');
const helper = require('./helper');

let _formatName = (name) => {
  return name[0].toUpperCase() + name.substr(1);
}

class Gremlose {
  #drc = null; // driver remote connection
  #g = null; // graph instance
  #client = null; // client execute query

  constructor (opts = {}) {
    const { wsUrl, host, port, pathname } = opts;

    if (!wsUrl && (!host || !port)) {
      throw new Error('Invalid config, missing wsUrl or host, port to connect Gremlin server');
    }

    this.wsUrl = wsUrl ? wsUrl : `ws://${host}:${port}${ pathname ? '/' + pathname : '' }`;
    const wsURL = new URL(this.wsUrl);

    this.host = wsURL.hostname;
    this.port = wsURL.port;
    this.pathname = wsURL.pathname;

    this.#drc = new DriverRemoteConnection(this.wsUrl);
    this.#g = traversal().withRemote(this.#drc);

    this.#client = new gremlin.driver.Client(this.wsUrl, {
      traversalSource: 'g',
      mimeType: 'application/json'
    });
  }

  get graphInstance () {
    return this.#g;
  }

  get clientInstance () {
    return this.#client;
  }

  createVertexModel (name) {
    if (!name) {
      throw new Error('Name is required');
    }

    name = _formatName(name);

    return new GremloseVertex(this.#g, this.#client, name);
  }

  createEdgeModel (name) {
    if (!name) {
      throw new Error('Name is required');
    }

    name = _.snakeCase(name);
    name = name.toUpperCase();

    return new GremloseEdge(this.#g, this.#client, name);
  }

  async createEdgeById(eLabel, idSource, idTarget, props = {}) {
    const _edgeModel = new GremloseEdge(this.#g, eLabel);
    return _edgeModel.createEdgeById(idSource, idTarget, props);
  }

  async createEdgeByVertex(eLabel, outV, inV, props = {}) {
    const { id: idSource } = outV;
    const { id: idTarget } = inV;

    return this.createEdgeById(eLabel, idSource, idTarget, props);
  }

  async removeAllVertex () {
    return GremloseVertex.removeAll(this.#g);
  }

  async removeAllEdge () {
    return GremloseEdge.removeAll(this.#g);
  }

  async removeOneProp (type, element, propKey) {
    let id = typeof element === 'string'
      ? element
      : ( // object
        type === 'vertex'
          ? element.id
          : element.id.relationId
      )

    const fn = type === 'vertex'
      ? this.#g.V
      : this.#g.E
    let chain = fn.call(this.#g, id).properties(propKey).drop();

    console.log('chain=', JSON.stringify(chain));

    return chain.next();
  }

  async removeProp (type, element, propKeys = []) {
    let id = typeof element === 'string'
      ? element
      : ( // object
        type === 'vertex'
          ? element.id
          : element.id.relationId
      )

    if (!Array.isArray(propKeys)) {
      return removeOneProp(type, element, propKeys);
    }

    const self = this;
    return async.eachLimit(propKeys, 1, async (propKey) => self.removeOneProp(type, element, propKey));
  }

  async updateProp (type, element, props = {}, meta = {}) {
    let id = typeof element === 'string'
      ? element
      : ( // object
        type === 'vertex'
          ? element.id
          : element.id.relationId
      )

    const fn = type === 'vertex'
      ? this.#g.V
      : this.#g.E

    if (typeof props !== 'object' || Array.isArray(props)) {
      throw new Error('prams props require type object');
    }

    let chain = fn.call(this.#g, id);
    chain = helper.addProps(chain, props, type, meta);

    return chain.next();
  }

  async executeQuery(query) {
    // const result = await this.#client.submit(helper.makeQuery(query), {});
    const result = await this.#client.submit(query, {});

    return result._items;
    // return helper.nodesToJson(result._items);
  }

  async getJsonById (type, id) {
    id = helper.stringifyValue(id);
    const query = type === 'vertex'
      ? `g.V(${id})`
      : `g.E(${id})`

    const result = await this.#client.submit(query, {});

    if (result && result._items && result._items[0]) {
      if (type === 'edge') return helper.parseEdgeFromQuery(result._items[0]);
      if (type === 'vertex') return helper.parseVertexFromQuery(result._items[0]);
    }

    return null;
  }

  async getProps (element, type = 'vertex') {
    if (!element) return null;

    let _chain = type === 'vertex'
      ? this.#g.V(element)
      : this.#g.E(element.id.relationId)

    let listProps = await _chain.properties().toList();
    const _gId = type === 'vertex' ? element.id : element.id.relationId;

    let props = listProps.map(p => {
      const { id, key, value } = p;
      let res = { key, value }

      if (type === 'vertex') {
        const { relationId: _relationId } = id;
        res = { _relationId, ...res };
      } else { // edge
        res.value = helper.parseJson(value)
      }

      return res;
    })

    props = _.groupBy(props, 'key');

    let _props = Object.keys(props).reduce((acc, k) => {
      let v = props[k];

      acc[k] = v.length === 1
        ? v[0].value
        : v.map(p => helper.parseJson(p.value))

      return acc;
    }, {});

    console.log('_props=', _props);

    _props = unflatten(_props);

    if (type === 'vertex') {
      return { _vId: _gId, ..._props };
    }

    return { _eId: _gId, ..._props };
  }

  async toJsonProps (arrVertex = []) {
    if (!arrVertex) return null;

    if (!Array.isArray(arrVertex)) {
      return this.getProps(arrVertex);
    }

    return async.mapLimit(arrVertex, 1, async (v) => this.getProps(v));
  }

  nodesToJson (nodes) {
    return helper.nodesToJson(nodes);
  }

  async close() {
    await this.#drc.close();
    await this.#client.close();

    this.#drc = null;
    this.#g = null;
    this.#client = null;
  }
}

module.exports = Gremlose;
