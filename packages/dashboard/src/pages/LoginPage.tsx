import { useState } from 'react';
import { api, setStoredApiKey } from '../api/client';

interface Props { onSuccess: () => void }

export function LoginPage({ onSuccess }: Props) {
  const [key, setKey] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const ok = await api.verifyKey(key.trim());
      if (ok) {
        setStoredApiKey(key.trim());
        onSuccess();
      } else {
        setError('Invalid API key. Check your ARGUS_API_KEY in .env.');
      }
    } catch {
      setError('Could not reach the Argus API. Is it running?');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center">
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-8 w-full max-w-sm shadow-2xl">
        <div className="flex items-center gap-3 mb-8">
          <span className="text-3xl">🔍</span>
          <div>
            <h1 className="text-xl font-bold text-white">Argus</h1>
            <p className="text-xs text-gray-400">Code Review Engine</p>
          </div>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1">API Key</label>
            <input
              type="password"
              value={key}
              onChange={e => setKey(e.target.value)}
              placeholder="argus-dev-key-..."
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-blue-500"
              required
            />
          </div>
          {error && <p className="text-xs text-red-400">{error}</p>}
          <button
            type="submit"
            disabled={loading || !key.trim()}
            className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm font-medium py-2 rounded-lg transition-colors"
          >
            {loading ? 'Verifying…' : 'Sign in'}
          </button>
        </form>
        <p className="text-xs text-gray-600 mt-6 text-center">
          Set <code className="text-gray-500">ARGUS_API_KEY</code> in your .env
        </p>
      </div>
    </div>
  );
}
