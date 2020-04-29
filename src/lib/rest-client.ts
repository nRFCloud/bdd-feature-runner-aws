import * as querystring from 'querystring';

const { fetch } = require('fetch-ponyfill')();

const toQueryString = (obj: any): string => {
  if (!Object.keys(obj).length) {
    return '';
  }
  return '?' + querystring.stringify(obj);
};

export type Headers = {
  [index: string]: string;
};

export class RestClient {
  headers: Headers = {
    Accept: 'application/json',
  };
  endpoint: string = '';

  response: {
    headers: Headers;
    statusCode: number;
    body: any;
  } = {
    headers: {},
    statusCode: -1,
    body: '',
  };

  async request(
    method: string,
    path: string,
    queryString?: object,
    extraHeaders?: Headers,
    body?: any,
    passBinary: boolean = false,
    directUrl: boolean = false,
    jsonResponseRequired: boolean = true,
  ): Promise<string> {
    const headers: Headers = {
      ...this.headers,
      ...extraHeaders,
    };

    let apiGatewayUrlPrefix = '';
    if (!directUrl) {
      apiGatewayUrlPrefix = this.endpoint.replace(/\/+$/, '') + '/';
    }
    const url = `${apiGatewayUrlPrefix}${path.replace(
      /^\/+/,
      '',
    )}${toQueryString(queryString || {})}`;
    const bodyToSend = body
      ? !passBinary && typeof body !== 'string'
        ? JSON.stringify(body)
        : body
      : undefined;
    headers['Content-Type'] =
      body != null && !passBinary && typeof body !== 'string'
        ? 'application/json'
        : 'text/plain';
    // Uncomment for debug
    /* console.log(
      'URL is:',
      url,
      '\nHeaders are:',
      headers,
      '\nBody is:\n',
      bodyToSend,
    ); */
    const res: Response = await fetch(url, {
      method,
      headers,
      body: bodyToSend,
    });
    const contentType: string = res.headers.get('content-type') || '',
      mediaType: string = contentType.split(';')[0];
    const text = await res.text();
    if (headers.Accept.indexOf(mediaType) < 0) {
      throw new Error(
        `The content-type "${contentType}" of the response does not match accepted media-type ${headers.Accept}`,
      );
    }
    const isJson = /^application\/([^ \/]+\+)?json$/.test(mediaType);
    if (jsonResponseRequired && !isJson) {
      throw new Error(
        `The content-type "${contentType}" of the response is not JSON!`,
      );
    }
    const statusCode: number = res.status;
    const contentLength: number = +(res.headers.get('content-length') || 0);
    const h: Headers = {};
    res.headers.forEach((v: string, k: string) => {
      h[k] = v;
    });
    this.response = {
      statusCode,
      headers: h,
      body: contentLength
        ? isJson
          ? JSON.parse(text)
          : Buffer.from(text)
        : undefined,
    };
    return url;
  }
}
