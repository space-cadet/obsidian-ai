# Chat Debug Capture

Use **Debug capture** when a chat uses more tokens than expected or when a
streaming response does not behave correctly.

## Turn it on

1. Open the chat you want to test.
2. Click the bug button in the chat toolbar.
3. Send the messages you want to investigate.
4. Export the chat as JSON, JSONL, or Markdown.

Debug capture is saved with that chat. It does not turn itself on for other
chats.

## What the export shows

Each assistant response includes a diagnostic trace. It records every call to
the model, not only the final answer.

For each call, the trace shows:

- the system instructions, previous messages, current message, and tool list;
- the size of each part of the request;
- any tool call and the result sent back to the model;
- whether a long tool result was shortened before the next call;
- provider token counts, response time, and finish reason.

If you press **Stop**, the trace also records when the request controller was
created, when cancellation was requested, and when the chat loop noticed it.

## Reading a token problem

Start with `diagnostics.steps` in the exported assistant message.

- A large `systemPrompt` means the fixed instructions or memory are expensive.
- A large `tools` value means the available tool descriptions are expensive.
- A large `history` value means earlier chat messages are being sent again.
- A large `currentMessage` value usually means selected notes or attachments
  are large.
- Several steps mean tools caused follow-up calls. Compare their histories and
  tool results to find what grew.

The local `estimatedTokens` fields are useful for comparison, but
`providerUsage` is the provider's actual token count.

## Expected Stop behavior

Pressing **Stop** cancels the active request. The chat should stop streaming,
keep any text already received, and label that partial answer as
`[interrupted]`. It must not continue to another tool call after cancellation.

## Fresh chats and selected notes

A fresh chat starts with no selected notes unless **Active Note** is enabled.
Switching to a different chat restores that chat's own selected notes. A note
selected in one chat must not appear in the first message of another chat.
