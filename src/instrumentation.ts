// Next.js instrumentation hook — runs once when the server boots.
// Starts the always-on cloud scheduler so scheduled agents run on the server
// independent of any user device. Only in the Node.js runtime (not edge).

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { startScheduler } = await import('./lib/scheduler')
    startScheduler()
  }
}
