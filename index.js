"use strict";
const geojsonVt = require("geojson-vt");
const vtPbf = require("vt-pbf");
const request = require("requestretry");
const zlib = require("zlib");
const NodeCache = require("node-cache" );
const _ = require("lodash");

const query = `
  query bikeparks {
    bikeParks {
      id
      name
      lon
      lat
    }
  }`;

const getBikeParks = (url, callback) => {
  request(
    {
      url: url,
      body: query,
      maxAttempts: 120,
      retryDelay: 30000,
      method: "POST",
      headers: {
        'Content-Type': 'application/graphql'
      }
    },
    function(err, res, body) {
      if (err) {
        console.log(`Error when downloading GeoJSON data from ${url}: ${err} ${res} ${body}`);
        callback(err);
        return;
      }
      callback(null, convertToGeoJson(JSON.parse(body)));
    }
  );
};

const convertToGeoJson = (json) => {
  const geoJson = {type: "FeatureCollection", features: json.data.bikeParks.map(station => ({
    type: "Feature",
    geometry: {type: "Point", coordinates: [station.lon, station.lat]},
    properties: {
      id: station.id,
      name: station.name,
      covered: station.covered,
    }
  }))}
  return geoJson;
}

class BikeParkSource {
  constructor(uri, callback) {
    this.cacheKey = "tileindex";
    this.cache = new NodeCache({ stdTTL: 15, useClones: false });
    if(!uri.protocol){
      uri.protocol = "http:"
    }
    this.url = uri;
    callback(null, this);
  }

  fetchGeoJson(callback){
    getBikeParks(this.url, (err, geojson) => {
      if (err) {
        callback(err);
        return;
      }
      callback(geojson);
    });
  }

  getTile(z, x, y, callback) {
    if(this.cache.get(this.cacheKey)) {
      const geojson = this.cache.get(this.cacheKey);
      this.computeTile(geojson, z, x, y, callback);
    } else {
      this.fetchGeoJson((geojson) => {
        this.cache.set(this.cacheKey, geojson);
        this.computeTile(geojson, z, x, y, callback);
      });
    }
  }

  computeTile(geoJson, z, x, y, callback) {
    const tileIndex = geojsonVt(geoJson, { maxZoom: 20, buffer: 512 });
    let tile = tileIndex.getTile(z, x, y);
    if (tile === null) {
      tile = { features: [] };
    }

    const data = Buffer.from(vtPbf.fromGeojsonVt({ bikeparks: tile }));

    zlib.gzip(data, function(err, buffer) {
      if (err) {
        callback(err);
        return;
      }

      callback(null, buffer, { "content-encoding": "gzip", "cache-control": "public,max-age=3600" });
    });
  }

  getInfo(callback) {
    callback(null, {
      format: "pbf",
      maxzoom: 20,
      vector_layers: [
        {
          description: "Bike parks retrieved from OTP",
          id: "bikeparks"
        }
      ]
    });
  }
}

module.exports = BikeParkSource;

module.exports.registerProtocols = tilelive => {
  tilelive.protocols["bikeparks:"] = BikeParkSource;
};

