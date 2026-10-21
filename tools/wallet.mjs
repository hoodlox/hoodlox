// A stand-in for an EVM wallet inside Playwright pages: window.ethereum backed by a private key held
// in Node. eth_requestAccounts / personal_sign behave like MetaMask; eth_sendTransaction signs in Node
// and sends to `rpc` (a Robinhood Chain fork in tools/check-fork.mjs).
import { createWalletClient, http, hexToString } from 'viem';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';

export const newKey = generatePrivateKey;

export async function useWallet(page, key = generatePrivateKey(), rpc = 'http://127.0.0.1:8545', chainId = 4663) {
  const account = privateKeyToAccount(key);
  await page.exposeFunction('__walletSign', (hex) => account.signMessage({ message: hexToString(hex) }));
  await page.exposeFunction('__walletSend', async (tx) => {
    const chain = { id: chainId, name: 'fork', nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 }, rpcUrls: { default: { http: [rpc] } } };
    const wallet = createWalletClient({ account, chain, transport: http(rpc) });
    return wallet.sendTransaction({ to: tx.to, data: tx.data, value: tx.value ? BigInt(tx.value) : undefined });
  });
  await page.addInitScript((addr) => {
    window.ethereum = {
      request: async ({ method, params }) => {
        if (method === 'eth_requestAccounts' || method === 'eth_accounts') return [addr];
        if (method === 'personal_sign') return window.__walletSign(params[0]);
        if (method === 'wallet_switchEthereumChain' || method === 'wallet_addEthereumChain') return null;
        if (method === 'eth_sendTransaction') return window.__walletSend(params[0]);
        throw new Error(`unsupported ${method}`);
      },
    };
  }, account.address);
  return { key, address: account.address };
}

// Node-side sign-in for a second hunter (no browser), returning a bearer token.
export async function apiSignIn(base, key = generatePrivateKey()) {
  const account = privateKeyToAccount(key);
  const post = async (path, body, token) => (await fetch(base + path, {
    method: 'POST', body: JSON.stringify(body),
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
  })).json();
  const { nonce, message } = await post('/api/auth/nonce', {});
  const signature = await account.signMessage({ message });
  const { token, me } = await post('/api/auth/login', { address: account.address, signature, nonce });
  return { token, me, address: account.address, post: (path, body) => post(path, body, token) };
}
