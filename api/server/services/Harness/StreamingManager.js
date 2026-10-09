'use strict';

/**
 * StreamingManager - SSE (Server-Sent Events) streaming
 * Uses native Node.js/Express - zero dependencies.
 * Streams LLM responses token by token to the client.
 */
class StreamingManager {
  constructor(config = {}) {
    this.heartbeatInterval = config.heartbeatInterval || 30000;
    this.maxRetries = config.maxRetries || 3;
    this.activeStreams = new Map();
    this.history = [];
  }

  /**
   * Create an SSE stream from an Express response.
   * Returns a StreamController that can be used to send events.
   */
  createStream(res, options = {}) {
    const streamId = `stream_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;

    // Set SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    // Send initial comment to establish connection
    res.write(':ok\n\n');

    const controller = {
      id: streamId,
      res,
      closed: false,
      sent: 0,

      // Send a text delta (token by token)
      sendText(text) {
        if (this.closed) return;
        const data = JSON.stringify({ type: 'text', content: text });
        this.res.write(`data: ${data}\n\n`);
        this.sent++;
      },

      // Send a tool call event
      sendToolCall(toolName, args) {
        if (this.closed) return;
        const data = JSON.stringify({ type: 'tool_call', name: toolName, args });
        this.res.write(`data: ${data}\n\n`);
        this.sent++;
      },

      // Send a tool result event
      sendToolResult(toolName, result) {
        if (this.closed) return;
        const data = JSON.stringify({ type: 'tool_result', name: toolName, result });
        this.res.write(`data: ${data}\n\n`);
        this.sent++;
      },

      // Send a status event
      sendStatus(status, message) {
        if (this.closed) return;
        const data = JSON.stringify({ type: 'status', status, message });
        this.res.write(`data: ${data}\n\n`);
        this.sent++;
      },

      // Send suggested actions
      sendSuggestions(suggestions) {
        if (this.closed) return;
        const data = JSON.stringify({ type: 'suggestions', actions: suggestions });
        this.res.write(`data: ${data}\n\n`);
        this.sent++;
      },

      // Send citations
      sendCitations(citations) {
        if (this.closed) return;
        const data = JSON.stringify({ type: 'citations', sources: citations });
        this.res.write(`data: ${data}\n\n`);
        this.sent++;
      },

      // Send a custom event
      sendEvent(eventName, data) {
        if (this.closed) return;
        const payload = JSON.stringify({ type: 'event', event: eventName, data });
        this.res.write(`data: ${payload}\n\n`);
        this.sent++;
      },

      // Send raw SSE data
      sendRaw(data) {
        if (this.closed) return;
        this.res.write(`data: ${data}\n\n`);
        this.sent++;
      },

      // Close the stream
      close(done = true) {
        if (this.closed) return;
        const data = JSON.stringify({ type: done ? 'done' : 'error', done });
        this.res.write(`data: ${data}\n\n`);
        this.res.write('data: [DONE]\n\n');
        this.closed = true;
        this.res.end();
      },

      // Send error and close
      error(message) {
        if (this.closed) return;
        const data = JSON.stringify({ type: 'error', error: message });
        this.res.write(`data: ${data}\n\n`);
        this.close(false);
      },
    };

    // Track the stream
    this.activeStreams.set(streamId, {
      controller,
      createdAt: new Date().toISOString(),
      closed: false,
    });

    // Heartbeat to keep connection alive
    const heartbeat = setInterval(() => {
      if (controller.closed) {
        clearInterval(heartbeat);
        return;
      }
      controller.res.write(':heartbeat\n\n');
    }, this.heartbeatInterval);

    // Clean up on close
    res.on('close', () => {
      controller.closed = true;
      clearInterval(heartbeat);
      const stream = this.activeStreams.get(streamId);
      if (stream) {
        stream.closed = true;
        this.history.push({
          id: streamId,
          sent: controller.sent,
          duration: Date.now() - new Date(stream.createdAt).getTime(),
          closedAt: new Date().toISOString(),
        });
      }
      this.activeStreams.delete(streamId);
    });

    return controller;
  }

  /**
   * Stream a full LLM response token by token.
   * Uses modelPlugin.complete with stream:true if available.
   */
  async streamLLMResponse(controller, params, modelPlugin) {
    try {
      controller.sendStatus('thinking', 'Processing your request...');

      // Try streaming with model plugin
      if (modelPlugin && modelPlugin.completeStream) {
        const stream = await modelPlugin.completeStream(params);
        for await (const chunk of stream) {
          if (chunk.content) controller.sendText(chunk.content);
          if (chunk.toolCalls) {
            for (const tc of chunk.toolCalls) {
              controller.sendToolCall(tc.name, tc.args);
            }
          }
        }
      } else {
        // Fallback: non-streaming response sent as one chunk
        const response = await modelPlugin.complete(params);
        controller.sendStatus('generating', 'Generating response...');
        
        // Simulate streaming by sending word by word
        const words = (response.content || '').split(' ');
        for (const word of words) {
          controller.sendText(word + ' ');
          await new Promise(r => setTimeout(r, 20));
        }
      }

      controller.close(true);
    } catch (err) {
      controller.error(err.message);
    }
  }

  /**
   * Get active streams.
   */
  getActiveStreams() {
    return Array.from(this.activeStreams.entries()).map(([id, s]) => ({
      id,
      sent: s.controller.sent,
      createdAt: s.createdAt,
    }));
  }

  getStats() {
    return {
      activeStreams: this.activeStreams.size,
      totalStreams: this.history.length,
      heartbeatInterval: this.heartbeatInterval,
    };
  }
}

module.exports = StreamingManager;
