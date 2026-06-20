@external("world_host_operation_v1", "output")
declare function hostOutput(ptr: usize, len: i32): void;

@external("world_host_operation_v1", "log")
declare function hostLog(ptr: usize, len: i32): void;

function emitUtf8(text: string, sink: (ptr: usize, len: i32) => void): void {
  const encoded = String.UTF8.encode(text, true);
  const buffer = changetype<ArrayBuffer>(encoded);
  sink(changetype<usize>(buffer), buffer.byteLength);
}

function emitOutput(text: string): void {
  emitUtf8(text, hostOutput);
}

function emitLog(text: string): void {
  emitUtf8(text, hostLog);
}

function escapeJsonString(value: string): string {
  let result = "";
  for (let index = 0; index < value.length; index += 1) {
    const ch = value.charCodeAt(index);
    if (ch == 34) {
      result += "\\\"";
    } else if (ch == 92) {
      result += "\\\\";
    } else if (ch == 10) {
      result += "\\n";
    } else if (ch == 13) {
      result += "\\r";
    } else if (ch == 9) {
      result += "\\t";
    } else {
      result += String.fromCharCode(ch);
    }
  }
  return result;
}

function extractHourStart(input: string): string {
  const needle = "\"hour_start\":";
  const start = input.indexOf(needle);
  if (start < 0) return "";
  let cursor = start + needle.length;
  while (cursor < input.length) {
    const ch = input.charCodeAt(cursor);
    if (ch == 32 || ch == 9 || ch == 10 || ch == 13) {
      cursor += 1;
      continue;
    }
    break;
  }
  if (cursor >= input.length || input.charCodeAt(cursor) != 34) return "";
  cursor += 1;
  let result = "";
  while (cursor < input.length) {
    const ch = input.charCodeAt(cursor);
    if (ch == 34) break;
    if (ch == 92 && cursor + 1 < input.length) {
      cursor += 1;
      result += String.fromCharCode(input.charCodeAt(cursor));
    } else {
      result += String.fromCharCode(ch);
    }
    cursor += 1;
  }
  return result;
}

function successEnvelope(hourStart: string): string {
  return "{\"status\":\"success\",\"payload\":{\"hour_start\":\""
    + escapeJsonString(hourStart)
    + "\",\"n_valid_channels\":5,\"n_bolts_evaluated\":3}}";
}

export function invoke(inputPtr: i32, inputLen: i32): i32 {
  if (inputPtr < 0 || inputLen < 0) {
    emitOutput("{\"status\":\"error\",\"error\":{\"code\":\"invalid_input\",\"message\":\"negative input pointer or length\"}}");
    return 1;
  }
  const input = String.UTF8.decodeUnsafe(inputPtr as usize, inputLen, true);
  const hourStart = extractHourStart(input);
  emitLog("fixture health classify shadow invoked");
  emitOutput(successEnvelope(hourStart));
  return 0;
}
