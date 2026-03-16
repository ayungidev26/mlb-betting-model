import { NextResponse } from "next/server"
import { runModel } from "@/lib/runModel"

export async function GET() {
  try {
    const result = await runModel()

    return NextResponse.json({
      status: "success",
      message: "Model ran successfully",
      result
    })
  } catch (error) {
    return NextResponse.json({
      status: "error",
      error: error.message
    })
  }
}
