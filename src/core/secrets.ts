import * as vscode from 'vscode';
import type { Platform } from '../types';

const KEY = (platform: Platform) => `cpSidekick.session.${platform}`;

export function getSession(secrets: vscode.SecretStorage, platform: Platform): Promise<string | undefined> {
  return Promise.resolve(secrets.get(KEY(platform)));
}

export function setSession(secrets: vscode.SecretStorage, platform: Platform, cookieJarJson: string): Promise<void> {
  return Promise.resolve(secrets.store(KEY(platform), cookieJarJson));
}

export function clearSession(secrets: vscode.SecretStorage, platform: Platform): Promise<void> {
  return Promise.resolve(secrets.delete(KEY(platform)));
}
