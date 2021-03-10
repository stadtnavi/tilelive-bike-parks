const fs = require("fs");
const assert = require("assert");
const BikeParkSource = require("./index");

describe("BikeParkSource", function() {

  it("fetch data", (done) => {
    const url = new URL('https://api.staging.stadtnavi.eu/routing/v1/router/index/graphql');
    const source = new BikeParkSource(url, () => {});
    assert.ok(source);

    // request tile in Herrenberg
    source.getTile(17, 68763, 45237, (err, response) => {
      assert.ok(response.length > 100);
      assert.ok(response);

      // request another tile
      // should come from the cache
      source.getTile(17, 68763, 45237, (err, response) => {
        assert.ok(response.length > 100);
        assert.ok(response);
        assert.ok(source.cache.has(source.cacheKey));
        done();
      })

    })
  });
});
