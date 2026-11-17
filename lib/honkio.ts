import { Honkio } from '@honkio/node';
import { honkioApiKey } from './config';

// Server only. This module reads the API key, so import it from server
// actions and route handlers, never from a 'use client' file.

let client: Honkio | undefined;

export function honkio(): Honkio {
  client ??= new Honkio(honkioApiKey());
  return client;
}
