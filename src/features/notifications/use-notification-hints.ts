import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { notificationTransport } from "./notifications.functions";
export function useNotificationHints() {
	const client = useQueryClient();
	const choice = useQuery({
		queryKey: ["notification-transport"],
		queryFn: () => notificationTransport(),
		staleTime: Infinity,
	});
	useEffect(() => {
		if (!choice.data) return;
		const refetch = () => {
			void client.invalidateQueries({ queryKey: ["notifications"] });
		};
		const receive = (event: MessageEvent) => {
			try {
				const hint = JSON.parse(String(event.data));
				if (
					hint.type === "notifications.created" &&
					typeof hint.data?.notificationId === "string" &&
					/^[a-f0-9-]{36}$/.test(hint.data.notificationId)
				)
					refetch();
			} catch {
				/* Malformed hints never become authoritative data. */
			}
		};
		if (choice.data === "sse") {
			const stream = new EventSource("/api/realtime/sse");
			stream.onopen = refetch;
			stream.addEventListener("notifications.created", receive);
			return () => stream.close();
		}
		let stopped = false,
			socket: WebSocket,
			timer: ReturnType<typeof setTimeout>;
		const connect = () => {
			if (stopped) return;
			socket = new WebSocket(
				`${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/api/realtime/websocket`,
			);
			socket.onopen = refetch;
			socket.onmessage = receive;
			socket.onclose = () => {
				if (!stopped) timer = setTimeout(connect, 2000);
			};
		};
		connect();
		return () => {
			stopped = true;
			clearTimeout(timer);
			socket?.close();
		};
	}, [choice.data, client]);
}
