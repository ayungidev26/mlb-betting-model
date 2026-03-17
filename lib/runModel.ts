export async function runModel() {

  console.log("Running daily MLB model...")

  return {
    status: "Model ran successfully",
    time: new Date().toISOString()
  }

}
