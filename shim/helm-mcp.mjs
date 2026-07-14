#!/usr/bin/env node

import readline from 'node:readline';

const SERVER_INFO = { name: 'helm', version: '0.2.0' };

const tools = [
  {
    name: 'helm_copy',
    description: 'Surface copyable text in the helm Stage.',
    inputSchema: {
      type: 'object',
      properties: {
        text: { type: 'string' },
        label: { type: 'string' },
      },
      required: ['text'],
      additionalProperties: false,
    },
  },
  {
    name: 'helm_show_link',
    description: 'Show a clickable link in the helm Stage.',
    inputSchema: {
      type: 'object',
      properties: {
        url: { type: 'string' },
        label: { type: 'string' },
      },
      required: ['url'],
      additionalProperties: false,
    },
  },
  {
    name: 'helm_show_image',
    description: 'Show an image from a local path in the helm Stage.',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string' },
      },
      required: ['path'],
      additionalProperties: false,
    },
  },
  {
    name: 'helm_show',
    description: 'Show a table, JSON, Markdown, or diff in the helm Stage.',
    inputSchema: {
      type: 'object',
      properties: {
        kind: { type: 'string', enum: ['table', 'json', 'md', 'diff'] },
        label: { type: 'string' },
        table: {
          type: 'object',
          properties: {
            columns: { type: 'array', items: { type: 'string' } },
            rows: {
              type: 'array',
              items: { type: 'array', items: { type: 'string' } },
            },
          },
          required: ['columns', 'rows'],
          additionalProperties: false,
        },
        content: { type: 'string' },
      },
      required: ['kind'],
      additionalProperties: false,
    },
  },
  {
    name: 'helm_progress',
    description: 'Show or update progress in the helm Stage.',
    inputSchema: {
      type: 'object',
      properties: {
        value: { type: 'number' },
        max: { type: 'number' },
        label: { type: 'string' },
        id: { type: 'string' },
      },
      required: ['value'],
      additionalProperties: false,
    },
  },
  {
    name: 'helm_confirm',
    description: 'Ask the user for confirmation in helm and wait for the answer.',
    inputSchema: {
      type: 'object',
      properties: {
        prompt: { type: 'string' },
        yes: { type: 'string' },
        no: { type: 'string' },
      },
      required: ['prompt'],
      additionalProperties: false,
    },
  },
  {
    name: 'helm_choose',
    description: 'Ask the user to choose an option in helm and wait for the answer.',
    inputSchema: {
      type: 'object',
      properties: {
        prompt: { type: 'string' },
        options: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              label: { type: 'string' },
              send: { type: 'string' },
            },
            required: ['label', 'send'],
            additionalProperties: false,
          },
        },
      },
      required: ['prompt', 'options'],
      additionalProperties: false,
    },
  },
  {
    name: 'helm_ask',
    description: 'Ask the user for text in helm and wait for the answer.',
    inputSchema: {
      type: 'object',
      properties: {
        prompt: { type: 'string' },
        placeholder: { type: 'string' },
      },
      required: ['prompt'],
      additionalProperties: false,
    },
  },
];

function send(message) {
  process.stdout.write(`${JSON.stringify(message)}\n`);
}

function sendResult(id, result) {
  send({ jsonrpc: '2.0', id, result });
}

function sendError(id, code, message) {
  send({ jsonrpc: '2.0', id, error: { code, message } });
}

function textResult(text, isError = false) {
  const result = { content: [{ type: 'text', text }] };
  if (isError) result.isError = true;
  return result;
}

function requireObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('arguments must be an object');
  }
  return value;
}

function requireString(args, key) {
  if (typeof args[key] !== 'string') throw new Error(`${key} must be a string`);
  return args[key];
}

function optionalString(args, key, target) {
  if (args[key] === undefined) return;
  if (typeof args[key] !== 'string') throw new Error(`${key} must be a string`);
  target[key] = args[key];
}

function requireNumber(args, key) {
  if (typeof args[key] !== 'number' || !Number.isFinite(args[key])) {
    throw new Error(`${key} must be a finite number`);
  }
  return args[key];
}

function optionalNumber(args, key, target) {
  if (args[key] === undefined) return;
  target[key] = requireNumber(args, key);
}

function buildToolCall(name, rawArguments) {
  const args = requireObject(rawArguments ?? {});
  let payload;
  let wait = false;

  switch (name) {
    case 'helm_copy':
      payload = { v: 1, t: 'copy', text: requireString(args, 'text') };
      optionalString(args, 'label', payload);
      break;

    case 'helm_show_link':
      payload = { v: 1, t: 'link', url: requireString(args, 'url') };
      optionalString(args, 'label', payload);
      break;

    case 'helm_show_image':
      payload = { v: 1, t: 'img', path: requireString(args, 'path') };
      break;

    case 'helm_show': {
      const kind = requireString(args, 'kind');
      if (!['table', 'json', 'md', 'diff'].includes(kind)) {
        throw new Error('kind must be table, json, md, or diff');
      }
      if (kind === 'table') {
        const table = requireObject(args.table);
        if (!Array.isArray(table.columns) || !table.columns.every((item) => typeof item === 'string')) {
          throw new Error('table.columns must be an array of strings');
        }
        if (
          !Array.isArray(table.rows)
          || !table.rows.every(
            (row) => Array.isArray(row) && row.every((item) => typeof item === 'string'),
          )
        ) {
          throw new Error('table.rows must be an array of string arrays');
        }
        payload = { v: 1, t: 'table', columns: table.columns, rows: table.rows };
      } else {
        payload = { v: 1, t: kind, [kind]: requireString(args, 'content') };
      }
      optionalString(args, 'label', payload);
      break;
    }

    case 'helm_progress':
      payload = { v: 1, t: 'progress', value: requireNumber(args, 'value') };
      optionalNumber(args, 'max', payload);
      optionalString(args, 'label', payload);
      optionalString(args, 'id', payload);
      break;

    case 'helm_confirm':
      payload = { v: 1, t: 'confirm', prompt: requireString(args, 'prompt') };
      optionalString(args, 'yes', payload);
      optionalString(args, 'no', payload);
      wait = true;
      break;

    case 'helm_choose':
      if (!Array.isArray(args.options)) throw new Error('options must be an array');
      payload = {
        v: 1,
        t: 'choice',
        prompt: requireString(args, 'prompt'),
        options: args.options.map((option, index) => {
          const item = requireObject(option);
          if (typeof item.label !== 'string' || typeof item.send !== 'string') {
            throw new Error(`options[${index}] must contain string label and send fields`);
          }
          return { label: item.label, send: item.send };
        }),
      };
      wait = true;
      break;

    case 'helm_ask':
      payload = { v: 1, t: 'ask', prompt: requireString(args, 'prompt') };
      optionalString(args, 'placeholder', payload);
      wait = true;
      break;

    default:
      throw new Error(`unknown tool: ${name}`);
  }

  return { payload, wait };
}

async function postToBridge(payload, wait) {
  const port = process.env.HELM_BRIDGE_PORT;
  const token = process.env.HELM_BRIDGE_TOKEN;
  const pane = process.env.HELM_PANE;

  if (!port || !token || !pane) {
    return textResult('helm bridge unavailable (not inside a helm pane)', true);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), wait ? 305_000 : 10_000);

  try {
    const response = await fetch(`http://127.0.0.1:${port}/stage`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ pane, payload, wait }),
      signal: controller.signal,
    });

    if (response.status === 504) {
      return textResult('user did not respond (timeout)', true);
    }
    if (response.status === 401) {
      return textResult('helm bridge rejected request (unauthorized)', true);
    }
    if (!response.ok) {
      return textResult(`helm bridge error (HTTP ${response.status})`, true);
    }
    if (!wait) return textResult('shown');

    let body;
    try {
      body = await response.json();
    } catch {
      return textResult('helm bridge returned an invalid response', true);
    }
    if (!body || typeof body.response !== 'string') {
      return textResult('helm bridge returned an invalid response', true);
    }
    return textResult(body.response);
  } catch (error) {
    if (error?.name === 'AbortError' && wait) {
      return textResult('user did not respond (timeout)', true);
    }
    return textResult('helm bridge unreachable', true);
  } finally {
    clearTimeout(timeout);
  }
}

async function handleMessage(message) {
  if (!message || typeof message !== 'object' || Array.isArray(message)) {
    sendError(null, -32600, 'Invalid Request');
    return;
  }

  const hasId = Object.prototype.hasOwnProperty.call(message, 'id');
  const id = hasId ? message.id : null;
  if (message.jsonrpc !== '2.0' || typeof message.method !== 'string') {
    sendError(hasId ? id : null, -32600, 'Invalid Request');
    return;
  }

  if (message.method === 'notifications/initialized') return;
  if (!hasId) return;

  switch (message.method) {
    case 'initialize':
      sendResult(id, {
        protocolVersion: message.params?.protocolVersion,
        capabilities: { tools: {} },
        serverInfo: SERVER_INFO,
      });
      return;

    case 'tools/list':
      sendResult(id, { tools });
      return;

    case 'tools/call': {
      const name = message.params?.name;
      if (typeof name !== 'string') {
        sendResult(id, textResult('invalid tool call: name must be a string', true));
        return;
      }

      let call;
      try {
        call = buildToolCall(name, message.params?.arguments);
      } catch (error) {
        sendResult(id, textResult(`invalid tool call: ${error.message}`, true));
        return;
      }

      sendResult(id, await postToBridge(call.payload, call.wait));
      return;
    }

    default:
      sendError(id, -32601, 'Method not found');
  }
}

process.stdout.on('error', (error) => {
  if (error.code === 'EPIPE') process.exit(0);
  process.stderr.write(`helm-mcp: ${error.message}\n`);
  process.exit(1);
});

const input = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });

for await (const line of input) {
  if (!line.trim()) continue;

  let message;
  try {
    message = JSON.parse(line);
  } catch {
    sendError(null, -32700, 'Parse error');
    continue;
  }

  try {
    await handleMessage(message);
  } catch (error) {
    const id = message && Object.prototype.hasOwnProperty.call(message, 'id') ? message.id : null;
    sendError(id, -32603, 'Internal error');
    process.stderr.write(`helm-mcp: ${error.message}\n`);
  }
}
