const [command, stage] = process.argv.slice(2);

console.error(
  `Command "${command ?? 'unknown'}" is reserved for implementation stage ${stage ?? 'a later stage'} and is not available yet.`,
);
process.exitCode = 1;
