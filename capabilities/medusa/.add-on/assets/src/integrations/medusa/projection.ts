import {
	hasControls,
	MedusaError,
	opaqueId,
	parse,
	type ResourceKind,
} from "./contract";
export type ProductProjection = {
	bindingId: string;
	remoteId: string;
	title: string;
	handle: string | null;
	status: string;
	sourceUpdatedAt: string | null;
	syncedAt: string;
	deleted: boolean;
};
export type OrderProjection = {
	bindingId: string;
	remoteId: string;
	status: string;
	paymentStatus: string;
	fulfillmentStatus: string;
	currency: string | null;
	total: string | null;
	sourceUpdatedAt: string | null;
	syncedAt: string;
	deleted: boolean;
};
export type Projection = ProductProjection | OrderProjection;
export function object(value: unknown): Record<string, unknown> {
	if (!value || typeof value !== "object" || Array.isArray(value))
		throw new MedusaError("unsupported");
	return value as Record<string, unknown>;
}
const enumValue = (value: unknown, values: string[]) =>
	typeof value === "string" && values.includes(value) ? value : "unknown";
function text(v: unknown, nullable = false) {
	if (nullable && (v === null || v === undefined)) return null;
	if (
		typeof v !== "string" ||
		v.length > 256 ||
		!!/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(
			v,
		) ||
		hasControls(v)
	)
		throw new MedusaError("unsupported");
	return v;
}
function timestamp(v: unknown) {
	if (v === undefined || v === null) return null;
	if (typeof v !== "string" || !Number.isFinite(Date.parse(v)))
		throw new MedusaError("unsupported");
	return new Date(v).toISOString();
}
export function exactTotal(v: unknown) {
	if (v == null) return null;
	if (typeof v !== "string" || !/^(0|[1-9][0-9]{0,23})(\.[0-9]{1,8})?$/.test(v))
		throw new MedusaError("unsupported");
	return v.includes(".") ? v.replace(/0+$/, "").replace(/\.$/, "") : v;
}
export function projection(
	kind: ResourceKind,
	bindingId: string,
	remoteId: string,
	response: unknown,
	now = new Date(),
): Projection {
	const entity = object(object(response)[kind]);
	if (parse(opaqueId, entity.id) !== remoteId)
		throw new MedusaError("unsupported");
	const common = {
		bindingId,
		remoteId,
		sourceUpdatedAt: timestamp(entity.updated_at),
		syncedAt: now.toISOString(),
		deleted: false,
	};
	if (kind === "product")
		return {
			...common,
			title: text(entity.title) as string,
			handle: text(entity.handle, true),
			status: enumValue(entity.status, [
				"draft",
				"proposed",
				"published",
				"rejected",
			]),
		};
	return {
		...common,
		status: enumValue(entity.status, [
			"pending",
			"completed",
			"draft",
			"archived",
			"canceled",
			"requires_action",
		]),
		paymentStatus: enumValue(entity.payment_status, [
			"not_paid",
			"awaiting",
			"authorized",
			"partially_authorized",
			"captured",
			"partially_captured",
			"partially_refunded",
			"refunded",
			"canceled",
			"requires_action",
		]),
		fulfillmentStatus: enumValue(entity.fulfillment_status, [
			"not_fulfilled",
			"partially_fulfilled",
			"fulfilled",
			"partially_shipped",
			"shipped",
			"partially_delivered",
			"delivered",
			"canceled",
		]),
		currency:
			typeof entity.currency_code === "string" &&
			/^[a-z]{3}$/.test(entity.currency_code)
				? entity.currency_code
				: null,
		total: exactTotal(entity.total),
	};
}
/** Closed serializer also used when reading retained DB JSON. */
export function serializeProjection(
	value: Projection,
	kind: ResourceKind,
): Projection {
	const c = {
		bindingId: value.bindingId,
		remoteId: value.remoteId,
		status: value.status,
		sourceUpdatedAt: value.sourceUpdatedAt,
		syncedAt: value.syncedAt,
		deleted: value.deleted,
	};
	if (kind === "product") {
		const p = value as ProductProjection;
		return { ...c, title: p.title, handle: p.handle };
	}
	const o = value as OrderProjection;
	return {
		...c,
		paymentStatus: o.paymentStatus,
		fulfillmentStatus: o.fulfillmentStatus,
		currency: o.currency,
		total: o.total,
	};
}
