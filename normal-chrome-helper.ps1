param(
  [int]$WheelScrollAmount = -900
)

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

  [DllImport("user32.dll")]
  public static extern IntPtr SendMessage(IntPtr windowHandle, uint message, IntPtr wParam, IntPtr lParam);

  public static IntPtr MakeLParam(int lowWord, int highWord) {
    return (IntPtr)((highWord << 16) | (lowWord & 0xffff));
  }
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

public static class ToastVerifier {
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

      int minY = Math.Min(35, height - 1);
      int maxY = Math.Min(height, 145);
      int minX = 0;
      int maxX = width;

      for (int y = minY; y < maxY; y += 2) {
        int runStart = -1;
        int runLength = 0;

        for (int x = minX; x < maxX; x += 2) {
          System.Drawing.Color color = bitmap.GetPixel(x, y);
          if (IsToastGray(color)) {
            if (runStart < 0) {
              runStart = x;
            }
            runLength += 2;
          } else {
            if (runLength >= Math.Min(420, width / 3)) {
              return (rect.Left + runStart) + "," + (rect.Top + y) + "," + runLength;
            }
            runStart = -1;
            runLength = 0;
          }
        }

        if (runLength >= Math.Min(420, width / 3)) {
          return (rect.Left + runStart) + "," + (rect.Top + y) + "," + runLength;
        }
      }

      return "";
    }
  }

  private static bool IsToastGray(System.Drawing.Color color) {
    int max = Math.Max(color.R, Math.Max(color.G, color.B));
    int min = Math.Min(color.R, Math.Min(color.G, color.B));
    return color.R >= 55 &&
      color.R <= 115 &&
      color.G >= 55 &&
      color.G <= 115 &&
      color.B >= 55 &&
      color.B <= 115 &&
      (max - min) <= 18;
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
  $rect = New-Object NativeMouseKeyboard+RECT
  [NativeMouseKeyboard]::GetWindowRect($handle, [ref]$rect) | Out-Null
  $clientX = $x - $rect.Left
  $clientY = $y - $rect.Top
  $lParam = [NativeMouseKeyboard]::MakeLParam($clientX, $clientY)
  [NativeMouseKeyboard]::SendMessage($handle, 0x0201, [IntPtr]1, $lParam) | Out-Null
  Start-Sleep -Milliseconds 35
  [NativeMouseKeyboard]::SendMessage($handle, 0x0202, [IntPtr]0, $lParam) | Out-Null
  return $found
}

function Scroll-VideoDown {
  $chrome = Get-ChromeWindow
  [NativeMouseKeyboard]::SetForegroundWindow($chrome.MainWindowHandle) | Out-Null
  Start-Sleep -Milliseconds 80
  [NativeMouseKeyboard]::SendMessage($chrome.MainWindowHandle, 0x0100, [IntPtr]0x28, [IntPtr]0) | Out-Null
  Start-Sleep -Milliseconds 60
  [NativeMouseKeyboard]::SendMessage($chrome.MainWindowHandle, 0x0101, [IntPtr]0x28, [IntPtr]0) | Out-Null
  return "$($chrome.Id),$($chrome.MainWindowHandle),ARROWDOWN"
}

function Verify-RepostToast {
  $chrome = Get-ChromeWindow
  [NativeMouseKeyboard]::SetForegroundWindow($chrome.MainWindowHandle) | Out-Null
  Start-Sleep -Milliseconds 80
  $found = [ToastVerifier]::Find($chrome.MainWindowHandle)
  if ([string]::IsNullOrWhiteSpace($found)) {
    return "$($chrome.Id),$($chrome.MainWindowHandle),X"
  }

  return "$($chrome.Id),$($chrome.MainWindowHandle),V,$found"
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
      "VERIFY" { Write-Output ("OK|" + (Verify-RepostToast)) }
      "SCROLL" { Write-Output ("OK|" + (Scroll-VideoDown)) }
      "EXIT" { Write-Output "OK|EXIT"; exit 0 }
      default { Write-Output ("ERR|Unknown command: " + $line) }
    }
  } catch {
    Write-Output ("ERR|" + $_.Exception.Message)
  }
}
