export function createCleanupStack() {
  const tasks = [];

  return {
    register(task) {
      tasks.unshift(task);
    },
    async run() {
      const errors = [];
      for (const task of tasks.splice(0)) {
        try {
          await task();
        } catch (error) {
          errors.push(error);
        }
      }
      if (errors.length) {
        throw new AggregateError(errors, "Playwright database cleanup failed");
      }
    },
  };
}
