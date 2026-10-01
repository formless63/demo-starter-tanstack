import {
	useInfiniteQuery,
	useMutation,
	useQueryClient,
} from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import {
	listNotifications,
	setNotificationRead,
} from "../features/notifications/notifications.functions";
import { useNotificationHints } from "../features/notifications/use-notification-hints";
export const Route = createFileRoute("/app/notifications")({
	component: NotificationsPage,
});
function NotificationsPage() {
	useNotificationHints();
	const client = useQueryClient();
	const [unreadOnly, setUnreadOnly] = useState(false);
	const query = useInfiniteQuery({
		queryKey: ["notifications", unreadOnly],
		initialPageParam: undefined as string | undefined,
		queryFn: ({ pageParam }) =>
			listNotifications({ data: { unreadOnly, cursor: pageParam } }),
		getNextPageParam: (page) => page.nextCursor ?? undefined,
	});
	const mutation = useMutation({
		mutationFn: ({ id, read }: { id: string; read: boolean }) =>
			setNotificationRead({ data: { id, read } }),
		onSuccess: () => client.invalidateQueries({ queryKey: ["notifications"] }),
	});
	return (
		<section className="space-y-6">
			<h1 className="text-3xl font-semibold">Notifications</h1>
			<p className="text-muted-foreground">
				Your activity, saved here for you.
			</p>
			<label className="flex items-center gap-2">
				<input
					type="checkbox"
					checked={unreadOnly}
					onChange={(event) => setUnreadOnly(event.target.checked)}
				/>{" "}
				Unread only
			</label>
			{query.isPending ? (
				<p>Loading notifications…</p>
			) : query.isError ? (
				<button type="button" onClick={() => void query.refetch()}>
					Try again
				</button>
			) : (
				<>
					{query.data.pages.flatMap((page) => page.notifications).length ===
						0 && <p>No notifications yet.</p>}
					<ul className="space-y-3">
						{query.data.pages
							.flatMap((page) => page.notifications)
							.map((notification) => (
								<li key={notification.id} className="rounded-lg border p-4">
									<h2 className="font-medium">{notification.title}</h2>
									<p className="whitespace-pre-wrap">{notification.body}</p>
									<button
										type="button"
										className="mt-3 underline"
										disabled={mutation.isPending}
										onClick={() =>
											mutation.mutate({
												id: notification.id,
												read: notification.readAt === null,
											})
										}
									>
										{notification.readAt ? "Mark unread" : "Mark read"}
									</button>
								</li>
							))}
					</ul>
					{query.hasNextPage && (
						<button
							type="button"
							disabled={query.isFetchingNextPage}
							onClick={() => void query.fetchNextPage()}
						>
							Load more
						</button>
					)}
				</>
			)}
			{mutation.isError && (
				<p role="alert">Could not update the notification. Please try again.</p>
			)}
		</section>
	);
}
