// Test hunters. Players enter with a wallet address only (no wallet connection, no signature), so a
// test hunter is just a fresh random address: pass it to the page as ?address=, or enter over the API.
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';

export const newAddress = () => privateKeyToAccount(generatePrivateKey()).address;

// Node-side hunter (no browser), returning a bearer token.
export async function apiEnter(base, address = newAddress()) {
  const post = async (path, body, token) => (await fetch(base + path, {
    method: 'POST', body: JSON.stringify(body),
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
  })).json();
  const { token, me } = await post('/api/auth/address', { address });
  return { token, me, address, post: (path, body) => post(path, body, token) };
}
