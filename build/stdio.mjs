// Piping a CLI into `head`, `less` or a closed pipe closes stdout early, and
// Node's default reaction is an unhandled EPIPE with a stack trace. That is
// noise, not a fault: the consumer got what it asked for and went away.
//
// Every entry point calls this first.

export function tolerateClosedPipe() {
  for (const stream of [process.stdout, process.stderr]) {
    stream.on('error', (err) => {
      if (err && (err.code === 'EPIPE' || err.code === 'ERR_STREAM_DESTROYED')) {
        process.exit(0);
      }
      throw err;
    });
  }
}
