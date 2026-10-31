import type { DigestRow, NightDigest } from '../digest/types.js';

export function Digest({ digest }: { digest: NightDigest }) {
  if (digest.rows.length === 0) {
    return (
      <>
        <h1>digest · {digest.night}</h1>
        <p class="mute">nothing ran</p>
        {digest.invalidLines > 0 && <p class="mute">{digest.invalidLines} invalid lines</p>}
      </>
    );
  }

  return (
    <>
      <h1>digest · {digest.night}</h1>
      {digest.invalidLines > 0 && <p class="mute">{digest.invalidLines} invalid lines</p>}
      <table>
        <thead>
          <tr>
            <th>job</th>
            <th>owner</th>
            <th>runs</th>
            <th>retries</th>
            <th>last status</th>
            <th>last error</th>
            <th>first</th>
            <th>last</th>
          </tr>
        </thead>
        <tbody>
          {digest.rows.map((row) => (
            <tr class={row.hasFailed || row.retries >= 3 ? 'warn' : ''}>
              <td>{row.job}</td>
              <td>{row.owner ?? '—'}</td>
              <td>{row.runs}</td>
              <td>{row.retries}</td>
              <td>{row.lastStatus}</td>
              <td>{row.lastError ?? '—'}</td>
              <td>{row.firstAt}</td>
              <td>{row.lastAt}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
