if (process.send) {
  process.on("message", message => {
    if (message === "postonce:shutdown") process.emit("SIGINT");
  });
  process.on("disconnect", () => process.emit("SIGTERM"));
}
