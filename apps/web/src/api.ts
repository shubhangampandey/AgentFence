import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
let csrf = "";
export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}
export function setCsrf(value: string) {
  csrf = value;
}
export async function request<T = any>(
  path: string,
  method = "GET",
  data?: unknown,
): Promise<T> {
  const response = await fetch("/api" + path, {
    signal: AbortSignal.timeout(30000),
    method,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(method === "GET" ? {} : { "X-CSRF-Token": csrf }),
    },
    ...(data === undefined ? {} : { body: JSON.stringify(data) }),
  });
  const body = await response
    .json()
    .catch(() => ({ error: { code: "API_RESPONSE_UNAVAILABLE" } }));
  if (response.status === 401 && !path.startsWith("/auth/"))
    window.dispatchEvent(new Event("agentfence:session-expired"));
  if (!response.ok)
    throw new ApiError(
      (
        {
          INVALID_LOGIN:
            "Email or password is incorrect. Use your registered account, or create an account.",
          EMAIL_ALREADY_REGISTERED:
            "An account already exists for this email. Sign in instead.",
        } as Record<string, string>
      )[body.error?.code] ??
        body.error?.code?.replaceAll("_", " ") ??
        "Request failed",
      response.status,
    );
  return body;
}
export const useApi = <T = any>(path: string) =>
  useQuery<T>({
    queryKey: [path],
    queryFn: () => request<T>(path),
    retry: (count, error) =>
      count < 2 && (!(error instanceof ApiError) || error.status >= 500),
    retryDelay: 500,
  });
export function useAction(path: string, method = "POST") {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (data: unknown) => request(path, method, data),
    onSuccess: () =>
      client.invalidateQueries({
        predicate: (q) =>
          !["/session", "/auth/session", "/config"].includes(
            String(q.queryKey[0]),
          ),
      }),
  });
}
export function download(name: string, data: unknown) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}
