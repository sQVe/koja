import { FrameBufferRenderable, RGBA } from '@opentui/core';
import type { OptimizedBuffer, RenderContext } from '@opentui/core';

interface FailedPaneOptions {
  message: string;
  width: number;
  height: number;
  left: number;
  top: number;
}

const wrapWord = (word: string, width: number): string[] => {
  const pieces: string[] = [];

  for (let start = 0; start < word.length; start += width) {
    pieces.push(word.slice(start, start + width));
  }

  return pieces;
};

const wrapMessage = (message: string, width: number): string[] => {
  const lines: string[] = [];
  let current = '';

  for (const word of message.split(' ')) {
    for (const piece of wrapWord(word, Math.max(width, 1))) {
      const joined = current === '' ? piece : `${current} ${piece}`;

      if (joined.length <= width) {
        current = joined;
      } else {
        lines.push(current);
        current = piece;
      }
    }
  }

  lines.push(current);

  return lines;
};

// Draws the error of a pane that never started, from the state the server sent.
export class FailedPaneRenderable extends FrameBufferRenderable {
  private readonly message: string;

  public constructor(
    context: RenderContext,
    { message, width, height, left, top }: FailedPaneOptions,
  ) {
    super(context, { width, height, position: 'absolute', left, top });
    this.message = message;
  }

  public move(left: number, top: number): void {
    this.left = left;
    this.top = top;
  }

  public resize(width: number, height: number): void {
    this.width = width;
    this.height = height;
  }

  protected override renderSelf(buffer: OptimizedBuffer): void {
    const { width, height } = this.frameBuffer;

    this.frameBuffer.fillRect(0, 0, width, height, RGBA.defaultBackground());

    // Stryker disable next-line MethodExpression: The frame buffer drops drawing outside it.
    const lines = wrapMessage(this.message, width).slice(0, height);

    lines.forEach((line, index) => {
      this.frameBuffer.drawText(line, 0, index, RGBA.defaultForeground());
    });

    super.renderSelf(buffer);
  }
}
