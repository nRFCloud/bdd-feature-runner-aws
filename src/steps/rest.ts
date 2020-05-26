import * as jsonata from 'jsonata';
import { StepRunner, StepRunnerFunc, Store } from '../lib/runner';
import { RestClient } from '../lib/rest-client';
import { expect } from 'chai';
import { regexMatcher } from '../lib/regexMatcher';
import { v4 } from 'uuid';
import { readFileSync } from 'fs';

const client = new RestClient();

export const restStepRunners = <W extends Store>(): StepRunner<W>[] => {
  const s = (rx: RegExp, run: StepRunnerFunc<W>): StepRunner<W> => ({
    willRun: regexMatcher(rx),
    run,
  });

  return [
    // Note! Setting a header sets it for all future requests too, until you change it, or clear it (see below)
    s(/^the ([^ ]+) header is "([^"]+)"$/, async ([name, value]) => {
      client.headers[name] = value;
    }),
    s(/^I clear the ([^ ]+) request header$/, async ([name]) => {
      delete client.headers[name];
    }),
    s(/^the endpoint is "([^"]+)"$/, async ([endpoint]) => {
      client.endpoint = endpoint;
    }),
    s(/^I GET (?:to )?([^ ]+) directly$/, async ([path]) => {
      return client.request(
        'GET',
        path,
        undefined,
        undefined,
        undefined,
        false, // passBinary, N/A
        true, // directURL, not thru our API Gateway
        false, // jsonResponseRequired
      );
    }),
    s(
      /^I (GET|PUT|POST|PATCH|DELETE) (?:to )?([^ ]+)$/,
      async ([method, path]) => {
        return client.request(method, path);
      },
    ),
    s(
      /^I (GET|PUT|POST|PATCH|DELETE) ([^ ]+) with this query$/,
      async ([method, path], step) => {
        if (!step.interpolatedArgument) {
          throw new Error('Must provide argument!');
        }
        const j = JSON.parse(step.interpolatedArgument);
        return client.request(method, path, j);
      },
    ),
    s(/^the response status code should be ([0-9]+)$/, async ([statusCode]) => {
      expect(client.response.statusCode).to.equal(+statusCode);
      return client.response.statusCode;
    }),
    s(/^the response ([^ ]+) should be "([^"]+)"$/, async ([name, value]) => {
      expect(client.response.headers).to.have.property(name.toLowerCase());
      expect(client.response.headers[name.toLowerCase()]).to.equal(value);
      return client.response.headers[name.toLowerCase()];
    }),
    s(/^the response should equal this JSON$/, async (_, step) => {
      if (!step.interpolatedArgument) {
        throw new Error('Must provide argument!');
      }
      const j = JSON.parse(step.interpolatedArgument);
      const body = filterOutNulls(client.response.body);
      console.log(body);
      expect(body).to.deep.equal(j);
      return body;
    }),
    s(/^"([^"]+)" of the response body is empty$/, async ([exp]) => {
      const e = jsonata(exp);
      const body = filterOutNulls(client.response.body);
      console.log(body);
      const v = e.evaluate(body);
      expect(v).to.be.an('undefined');
      return v;
    }),
    s(/^"([^"]+)" of the response body is not empty$/, async ([exp]) => {
      const e = jsonata(exp);
      const body = filterOutNulls(client.response.body);
      console.log(body);
      const v = e.evaluate(body);
      expect(v).to.not.be.an('undefined');
      return v;
    }),
    s(/^"([^"]+)" of the response body is null$/, async ([exp]) => {
      const e = jsonata(exp);
      const body = filterOutNulls(client.response.body);
      console.log(body);
      const v = e.evaluate(body);
      expect(v).to.equal(null);
      return v;
    }),
    s(/^"([^"]+)" of the response body is not null$/, async ([exp]) => {
      const e = jsonata(exp);
      const body = filterOutNulls(client.response.body);
      console.log(body);
      const v = e.evaluate(body);
      expect(v).to.not.equal(null);
      return v;
    }),
    s(
      /^"([^"]+)" of the response body should equal "([^"]+)"$/,
      async ([exp, expected]) => {
        const e = jsonata(exp);
        const body = filterOutNulls(client.response.body);
        console.log(body);
        const v = e.evaluate(body);
        expect(v).to.equal(expected);
        return v;
      },
    ),
    s(
      /^"([^"]+)" of the response body should equal ([0-9]+)$/,
      async ([exp, expected]) => {
        const e = jsonata(exp);
        const body = filterOutNulls(client.response.body);
        console.log(body);
        const v = e.evaluate(body);
        expect(v).to.equal(+expected);
        return v;
      },
    ),
    s(
      /^"([^"]+)" of the response body should be greater than ([0-9]+)$/,
      async ([exp, expected]) => {
        const e = jsonata(exp);
        const body = filterOutNulls(client.response.body);
        console.log(body);
        const v = e.evaluate(body);
        expect(v).to.be.gt(+expected);
        return v;
      },
    ),
    s(
      /^"([^"]+)" of the response body should equal this JSON$/,
      async ([exp], step) => {
        if (!step.interpolatedArgument) {
          throw new Error('Must provide argument!');
        }
        const j = JSON.parse(step.interpolatedArgument);
        const e = jsonata(exp);
        const body = filterOutNulls(client.response.body);
        console.log(body);
        const v = e.evaluate(body);
        expect(v).to.deep.equal(j);
        return v;
      },
    ),
    s(
      /^I (POST|PUT|PATCH) (?:to )?([^ ]+) with this JSON$/,
      async ([method, path], step) => {
        if (!step.interpolatedArgument) {
          throw new Error('Must provide argument!');
        }
        const re = new RegExp('<guid>', 'i');
        if (path.match(re)) {
          path = path.replace('<guid>', v4());
        }
        const j = JSON.parse(step.interpolatedArgument);
        return [await client.request(method, path, undefined, undefined, j), j];
      },
    ),
    s(
      /^I (POST|PUT|PATCH) (?:to )?([^ ]+) with the file "([^"]+)"$/,
      async ([method, path, localFile]) => {
        const re = new RegExp('<guid>', 'i');
        if (path.match(re)) {
          path = path.replace('<guid>', v4());
        }
        const buffer = readFileSync(localFile);
        return [
          await client.request(
            method,
            path,
            undefined,
            undefined,
            buffer,
            true, // passBinary
          ),
          buffer.length,
        ];
      },
    ),
    s(
      /^a page with ([0-9]+)(?: of ([0-9]+))? items? is returned$/,
      async ([num, total]) => {
        expect(client.response.body).to.have.property('items');
        expect(client.response.body).to.have.property('total');
        if (total) {
          expect(client.response.body.total).to.equal(+total);
        } else {
          expect(client.response.body.total).to.be.at.least(+num);
        }
        expect(client.response.body.items).to.have.length(+num);
        return client.response.body;
      },
    ),
    s(/^a page is returned$/, async () => {
      expect(client.response.body).to.have.property('items');
      expect(client.response.body).to.have.property('total');
      return client.response.body;
    }),
    s(
      /^I store "([^"]+)" of the response body as "([^"]+)"(?: encoded with (encodeURIComponent))?$/,
      async ([expression, storeName, encoder], _, runner) => {
        const e = jsonata(expression);
        const result = e.evaluate(client.response.body);
        expect(result).to.not.be.an('undefined');
        switch (encoder) {
          case 'encodeURIComponent':
            runner.store[storeName] = encodeURIComponent(result);
            break;
          default:
            runner.store[storeName] = result;
        }
        return result;
      },
    ),
    s(
      /^I store the ([^ ]+) response header as "([^"]+)"$/,
      async ([header, storeName], _, runner) => {
        expect(client.response.headers).to.have.property(header.toLowerCase());
        expect(client.response.headers[header.toLowerCase()]).to.have.not.be.an(
          'undefined',
        );
        runner.store[storeName] = client.response.headers[header.toLowerCase()];
        return client.response.headers[header.toLowerCase()];
      },
    ),
  ];
};
