const readline = require("readline");
const { spawn } = require("child_process");
const path = require("path");

// Safety controls. Review these before every run.
const MAX_REPOSTS_TO_REMOVE = 1000;
const DELAY_MS = 300;
const AFTER_SCROLL_DELAY_MS = 1200;
const VERIFY_TIMEOUT_MS = 2000;
const VERIFY_POLL_MS = 150;
const STOP_AFTER_CONSECUTIVE_X = 5;
const CONFIRM_EVERY = 0;
const WHEEL_SCROLL_AMOUNT = -900;
const DRY_RUN = false;
const COLORS = {
  reset: "\x1b[0m",
  dim: "\x1b[2m",
  bright: "\x1b[1m",
  cyan: "\x1b[36m",
  green: "\x1b[32m",
  magenta: "\x1b[35m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
  gray: "\x1b[90m",
};

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function ask(question) {
  const terminal = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    terminal.question(question, (answer) => {
      terminal.close();
      resolve(answer.trim());
    });
  });
}

function printBanner() {
  const c = COLORS;

  console.log(String.raw`
${c.green}   .--------------------------------------------------.
   |${c.reset} ${c.bright}${c.cyan}TIKTOK REPOST CLEANER${c.reset}${c.green}                           |
   |${c.reset} ${c.gray}normal-chrome assisted control module${c.green}            |
   |--------------------------------------------------|
   |${c.reset} ${c.yellow}STATUS${c.reset}: armed      ${c.yellow}VERIFY${c.reset}: toast-scan      ${c.yellow}MODE${c.reset}: local ${c.green}|
   '--------------------------------------------------'${c.reset}
  `);
  console.log(`       ${c.magenta}MADE BY GIL${c.reset}`);
  console.log(`       ${c.dim}detect yellow button -> click -> verify -> next${c.reset}`);
  console.log("");
}

function helperScript() {
  return `
$ErrorActionPreference = "Stop"
Add-Type -ReferencedAssemblies System.Drawing -TypeDefinition @"
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;

public static class NativeMouseKeyboard {
  [StructLayout(LayoutKind.Sequential)]
  public struct RECT {
    public int Left;
    public int Top;
    public int Right;
    public int Bottom;
  }

  [DllImport("user32.dll")]
  public static extern bool SetCursorPos(int x, int y);

  [DllImport("user32.dll")]
  public static extern bool GetWindowRect(IntPtr windowHandle, out RECT rect);

  [DllImport("user32.dll")]
  public static extern bool SetForegroundWindow(IntPtr windowHandle);

  [DllImport("user32.dll")]
  public static extern void mouse_event(uint flags, uint dx, uint dy, int data, UIntPtr extraInfo);
}

public static class YellowButtonFinder {
  public static string Find(IntPtr windowHandle) {
    NativeMouseKeyboard.RECT rect;
    NativeMouseKeyboard.GetWindowRect(windowHandle, out rect);

    int width = rect.Right - rect.Left;
    int height = rect.Bottom - rect.Top;
    if (width <= 0 || height <= 0) {
      throw new Exception("Chrome window size is invalid.");
    }

    using (System.Drawing.Bitmap bitmap = new System.Drawing.Bitmap(width, height))
    using (System.Drawing.Graphics graphics = System.Drawing.Graphics.FromImage(bitmap)) {
      graphics.CopyFromScreen(rect.Left, rect.Top, 0, 0, new System.Drawing.Size(width, height));

      int minX = 0;
      int maxX = Math.Min(width, 560);
      int minY = 55;
      int maxY = Math.Min(height - 40, Math.Max(520, height * 4 / 5));
      bool[,] visited = new bool[maxX - minX, maxY - minY];
      Component best = null;
      double bestScore = Double.NegativeInfinity;

      for (int y = minY; y < maxY; y++) {
        for (int x = minX; x < maxX; x++) {
          int localX = x - minX;
          int localY = y - minY;

          if (visited[localX, localY] || !IsYellow(bitmap.GetPixel(x, y))) {
            continue;
          }

          Component component = FloodFill(bitmap, visited, minX, minY, maxX, maxY, x, y);
          if (!LooksLikeButton(component)) {
            continue;
          }

          double centerX = component.CenterX;
          double centerY = component.CenterY;
          double sizeScore = Math.Min(component.Width, component.Height);
          double shapePenalty = Math.Abs(component.Width - component.Height) * 2.0;
          double xPenalty = Math.Abs(centerX - 205) * 0.20;
          double topPenalty = centerY < 130 ? 90 : 0;
          double bottomPenalty = centerY > height * 0.82 ? 90 : 0;
          double score = component.Area + sizeScore - shapePenalty - xPenalty - topPenalty - bottomPenalty;

          if (score > bestScore) {
            bestScore = score;
            best = component;
          }
        }
      }

      if (best == null) {
        throw new Exception("Could not find a yellow repost button in the Chrome window.");
      }

      int absoluteX = rect.Left + (int)Math.Round(best.CenterX);
      int absoluteY = rect.Top + (int)Math.Round(best.CenterY);
      return absoluteX + "," + absoluteY + "," + best.Area + "," + best.Width + "," + best.Height;
    }
  }

  private static bool IsYellow(System.Drawing.Color color) {
    return color.R >= 185 && color.G >= 130 && color.G <= 235 && color.B <= 140 && color.R >= color.G;
  }

  private static bool LooksLikeButton(Component component) {
    return component.Area >= 80 &&
      component.Area <= 3500 &&
      component.Width >= 12 &&
      component.Width <= 95 &&
      component.Height >= 12 &&
      component.Height <= 95;
  }

  private static Component FloodFill(
    System.Drawing.Bitmap bitmap,
    bool[,] visited,
    int minX,
    int minY,
    int maxX,
    int maxY,
    int startX,
    int startY
  ) {
    Stack<System.Drawing.Point> stack = new Stack<System.Drawing.Point>();
    Component component = new Component();
    stack.Push(new System.Drawing.Point(startX, startY));

    while (stack.Count > 0) {
      System.Drawing.Point point = stack.Pop();

      if (point.X < minX || point.X >= maxX || point.Y < minY || point.Y >= maxY) {
        continue;
      }

      int localX = point.X - minX;
      int localY = point.Y - minY;

      if (visited[localX, localY] || !IsYellow(bitmap.GetPixel(point.X, point.Y))) {
        continue;
      }

      visited[localX, localY] = true;
      component.Add(point.X, point.Y);

      stack.Push(new System.Drawing.Point(point.X + 1, point.Y));
      stack.Push(new System.Drawing.Point(point.X - 1, point.Y));
      stack.Push(new System.Drawing.Point(point.X, point.Y + 1));
      stack.Push(new System.Drawing.Point(point.X, point.Y - 1));
    }

    return component;
  }

  private sealed class Component {
    public int Area { get; private set; }
    public int MinX { get; private set; }
    public int MinY { get; private set; }
    public int MaxX { get; private set; }
    public int MaxY { get; private set; }

    public int Width { get { return MaxX - MinX + 1; } }
    public int Height { get { return MaxY - MinY + 1; } }
    public double CenterX { get { return (MinX + MaxX) / 2.0; } }
    public double CenterY { get { return (MinY + MaxY) / 2.0; } }

    public Component() {
      MinX = Int32.MaxValue;
      MinY = Int32.MaxValue;
      MaxX = Int32.MinValue;
      MaxY = Int32.MinValue;
    }

    public void Add(int x, int y) {
      Area++;
      MinX = Math.Min(MinX, x);
      MinY = Math.Min(MinY, y);
      MaxX = Math.Max(MaxX, x);
      MaxY = Math.Max(MaxY, y);
    }
  }
}
"@

function Get-ChromeWindow {
  $chrome = Get-Process chrome -ErrorAction SilentlyContinue |
    Where-Object { $_.MainWindowHandle -ne 0 } |
    Sort-Object StartTime -Descending |
    Select-Object -First 1

  if (-not $chrome) {
    throw "Could not find a visible Chrome window."
  }

  return $chrome
}

function Get-ChromeRect($chrome) {
  $rect = New-Object NativeMouseKeyboard+RECT
  [NativeMouseKeyboard]::GetWindowRect($chrome.MainWindowHandle, [ref]$rect) | Out-Null
  return $rect
}

function Find-YellowButton {
  $chrome = Get-ChromeWindow
  [NativeMouseKeyboard]::SetForegroundWindow($chrome.MainWindowHandle) | Out-Null
  Start-Sleep -Milliseconds 80
  $found = [YellowButtonFinder]::Find($chrome.MainWindowHandle)
  return "$($chrome.Id),$($chrome.MainWindowHandle),$found"
}

function Click-YellowButton {
  $found = Find-YellowButton
  $parts = $found.Split(",")
  $handle = [IntPtr][Int64]$parts[1]
  $x = [int]$parts[2]
  $y = [int]$parts[3]
  [NativeMouseKeyboard]::SetForegroundWindow($handle) | Out-Null
  [NativeMouseKeyboard]::SetCursorPos($x, $y) | Out-Null
  Start-Sleep -Milliseconds 35
  [NativeMouseKeyboard]::mouse_event(0x0002, 0, 0, 0, [UIntPtr]::Zero)
  Start-Sleep -Milliseconds 35
  [NativeMouseKeyboard]::mouse_event(0x0004, 0, 0, 0, [UIntPtr]::Zero)
  return $found
}

function Scroll-VideoDown {
  $chrome = Get-ChromeWindow
  $rect = Get-ChromeRect $chrome
  $x = [int]($rect.Left + (($rect.Right - $rect.Left) * 0.68))
  $y = [int]($rect.Top + (($rect.Bottom - $rect.Top) * 0.52))
  [NativeMouseKeyboard]::SetForegroundWindow($chrome.MainWindowHandle) | Out-Null
  [NativeMouseKeyboard]::SetCursorPos($x, $y) | Out-Null
  Start-Sleep -Milliseconds 60
  [NativeMouseKeyboard]::mouse_event(0x0800, 0, 0, ${WHEEL_SCROLL_AMOUNT}, [UIntPtr]::Zero)
  Start-Sleep -Milliseconds 60
  [NativeMouseKeyboard]::mouse_event(0x0800, 0, 0, ${WHEEL_SCROLL_AMOUNT}, [UIntPtr]::Zero)
  return "$($chrome.Id),$($chrome.MainWindowHandle),$x,$y"
}

Write-Output "READY"

while ($true) {
  $line = [Console]::In.ReadLine()
  if ($null -eq $line) {
    break
  }

  try {
    switch ($line.Trim().ToUpperInvariant()) {
      "FIND" { Write-Output ("OK|" + (Find-YellowButton)) }
      "CLICK" { Write-Output ("OK|" + (Click-YellowButton)) }
      "SCROLL" { Write-Output ("OK|" + (Scroll-VideoDown)) }
      "EXIT" { Write-Output "OK|EXIT"; exit 0 }
      default { Write-Output ("ERR|Unknown command: " + $line) }
    }
  } catch {
    Write-Output ("ERR|" + $_.Exception.Message)
  }
}
`;
}

class PowerShellHelper {
  constructor() {
    const helperPath = path.join(__dirname, "normal-chrome-helper.ps1");

    this.process = spawn(
      "powershell.exe",
      [
        "-NoProfile",
        "-ExecutionPolicy",
        "Bypass",
        "-File",
        helperPath,
        "-WheelScrollAmount",
        String(WHEEL_SCROLL_AMOUNT),
      ],
      { stdio: ["pipe", "pipe", "pipe"], windowsHide: true },
    );
    this.pending = [];
    this.ready = false;
    this.stdoutBuffer = "";

    this.process.stdout.setEncoding("utf8");
    this.process.stderr.setEncoding("utf8");
    this.process.stdout.on("data", (chunk) => this.handleStdout(chunk));
    this.process.stderr.on("data", (chunk) => {
      const message = chunk.trim();
      if (message) {
        console.error(`PowerShell helper: ${message}`);
      }
    });

    this.readyPromise = this.waitForReady();
  }

  handleStdout(chunk) {
    this.stdoutBuffer += chunk;
    const parts = this.stdoutBuffer.split(/\r?\n/);
    this.stdoutBuffer = parts.pop() || "";
    const lines = parts.filter((line) => line.length > 0);

    for (const line of lines) {
      if (!this.ready && line.trim() === "READY") {
        this.ready = true;
        if (this.readyResolve) {
          this.readyResolve();
        }
        continue;
      }

      const pending = this.pending.shift();
      if (!pending) {
        continue;
      }

      if (line.startsWith("OK|")) {
        pending.resolve(line.slice(3));
      } else if (line.startsWith("ERR|")) {
        pending.reject(new Error(line.slice(4)));
      } else {
        pending.reject(new Error(`Unexpected helper response: ${line}`));
      }
    }
  }

  waitForReady() {
    return new Promise((resolve, reject) => {
      this.readyResolve = resolve;
      this.process.once("exit", (code) => {
        if (!this.ready) {
          reject(new Error(`PowerShell helper exited before ready. Code: ${code}`));
        }
      });
    });
  }

  async command(name) {
    await this.readyPromise;

    return new Promise((resolve, reject) => {
      this.pending.push({ resolve, reject });
      this.process.stdin.write(`${name}\n`);
    });
  }

  async close() {
    if (this.process.exitCode !== null) {
      return;
    }

    try {
      await this.command("EXIT");
    } catch (_) {
      this.process.kill();
    }
  }
}

function parseButtonResult(result) {
  const [processId, windowHandle, x, y, area, width, height] = result
    .split(",")
    .map((value) => Number(value));

  const values = [processId, windowHandle, x, y, area, width, height];
  if (values.some((value) => !Number.isFinite(value))) {
    throw new Error(`Could not parse helper result: ${result}`);
  }

  return { processId, windowHandle, x, y, area, width, height };
}

function parseVerificationResult(result) {
  const parts = result.split(",");
  const status = parts[2];

  return {
    status,
    raw: result,
  };
}

async function waitForVerification(helper) {
  const deadline = Date.now() + VERIFY_TIMEOUT_MS;

  while (Date.now() < deadline) {
    const result = parseVerificationResult(await helper.command("VERIFY"));

    if (result.status === "V") {
      return result;
    }

    await wait(VERIFY_POLL_MS);
  }

  return { status: "X", raw: "" };
}

async function main() {
  printBanner();
  console.log(`${COLORS.cyan}Maximum videos this run:${COLORS.reset} ${MAX_REPOSTS_TO_REMOVE}`);
  console.log(`${COLORS.cyan}Delay after click:${COLORS.reset} ${DELAY_MS}ms`);
  console.log(`${COLORS.cyan}Delay after scroll:${COLORS.reset} ${AFTER_SCROLL_DELAY_MS}ms`);
  console.log(`${COLORS.cyan}Verify timeout:${COLORS.reset} ${VERIFY_TIMEOUT_MS}ms`);
  console.log(`${COLORS.cyan}Stop after consecutive X:${COLORS.reset} ${STOP_AFTER_CONSECUTIVE_X}`);
  console.log(
    `${COLORS.cyan}Confirm every:${COLORS.reset} ${
      CONFIRM_EVERY === 0 ? "never after start" : `${CONFIRM_EVERY} video(s)`
    }`,
  );
  console.log(`${COLORS.cyan}Dry run:${COLORS.reset} ${DRY_RUN}`);
  console.log("");
  console.log("Before continuing:");
  console.log("1. Open normal Chrome.");
  console.log("2. Go to TikTok > your profile > Reposts.");
  console.log("3. Open the first repost video.");
  console.log("4. Make sure the yellow repost button is visible.");
  console.log("5. Keep Chrome visible and return focus to this terminal with the keyboard.");

  await ask("\nPress Enter when the yellow repost button is visible...");

  const helper = new PowerShellHelper();

  try {
    const initialButton = parseButtonResult(await helper.command("FIND"));

    console.log(
      `Found yellow repost button at x=${initialButton.x}, y=${initialButton.y} (${initialButton.width}x${initialButton.height})`,
    );
    console.log("The script will scan Chrome for the yellow button before every click.");
    console.log("After each click, it presses ArrowDown to move to the next video.");

    const confirmation = await ask("Type YES to start, or anything else to cancel: ");
    if (confirmation.toUpperCase() !== "YES") {
      console.log("Cancelled.");
      return;
    }

    let consecutiveFailures = 0;

    for (let index = 1; index <= MAX_REPOSTS_TO_REMOVE; index += 1) {
      try {
        if (DRY_RUN) {
          const chromePoint = parseButtonResult(await helper.command("FIND"));
          console.log(
            `Dry run: found repost button for video ${index}/${MAX_REPOSTS_TO_REMOVE} at x=${chromePoint.x}, y=${chromePoint.y}`,
          );
        } else {
          const chromePoint = parseButtonResult(await helper.command("CLICK"));
          console.log(`Removed ${index}/${MAX_REPOSTS_TO_REMOVE} at x=${chromePoint.x}, y=${chromePoint.y}`);
        }

        await wait(DELAY_MS);

        const verification = await waitForVerification(helper);
        if (verification.status === "V") {
          console.log(`${COLORS.green}V${COLORS.reset} ${index}/${MAX_REPOSTS_TO_REMOVE}`);
          consecutiveFailures = 0;
        } else {
          console.log(`${COLORS.red}X${COLORS.reset} ${index}/${MAX_REPOSTS_TO_REMOVE}`);
          consecutiveFailures += 1;

          if (consecutiveFailures >= STOP_AFTER_CONSECUTIVE_X) {
            console.log(`Stopped after ${consecutiveFailures} consecutive verification failures.`);
            break;
          }
        }

        if (index < MAX_REPOSTS_TO_REMOVE) {
          await helper.command("SCROLL");
          await wait(AFTER_SCROLL_DELAY_MS);
        }

        if (CONFIRM_EVERY > 0 && index < MAX_REPOSTS_TO_REMOVE && index % CONFIRM_EVERY === 0) {
          const continueAnswer = await ask(
            `Completed ${index}/${MAX_REPOSTS_TO_REMOVE}. Type YES to continue, or anything else to stop: `,
          );

          if (continueAnswer.toUpperCase() !== "YES") {
            console.log(`Stopped after ${index} video(s).`);
            break;
          }
        }
      } catch (error) {
        console.error(`Failed on video ${index}: ${error.message}`);
        break;
      }
    }

    console.log("Done");
  } finally {
    await helper.close();
  }
}

main().catch((error) => {
  console.error(`Stopped: ${error.message}`);
});
