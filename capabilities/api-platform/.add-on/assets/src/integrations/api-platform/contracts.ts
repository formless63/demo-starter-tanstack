import type { ZodObject, ZodType } from "zod";
import type { ApiPermissionRequirement } from "./permissions";

export type ApiMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export type ApiResponseContract = {
	description: string;
	schema?: ZodType;
};

export type ApiOperation = {
	method: ApiMethod;
	path: `/api/v1/${string}`;
	operationId: string;
	summary: string;
	description?: string;
	tags: string[];
	pathParams?: ZodObject;
	queryParams?: ZodObject;
	requestBody?: ZodType;
	responses: Record<number, ApiResponseContract>;
	machineAuth: boolean;
	permissions: ApiPermissionRequirement;
};

export function defineApiOperation<const T extends ApiOperation>(operation: T) {
	return operation;
}
