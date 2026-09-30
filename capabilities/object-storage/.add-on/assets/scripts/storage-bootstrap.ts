import { CreateBucketCommand, PutBucketCorsCommand } from "@aws-sdk/client-s3";
import { storageConfig } from "../src/integrations/storage/config.server";
import { getStorage } from "../src/integrations/storage/storage.server";
import { storageError } from "../src/integrations/storage/errors.server";

// Explicit operator action, never imported by application startup.
if (process.env.STORAGE_DEV_BOOTSTRAP !== "true")
	throw new Error(
		"Set STORAGE_DEV_BOOTSTRAP=true only for a development bucket",
	);
const storage = getStorage();
try {
	const config = storageConfig();
	try {
		await storage.checkStorage();
	} catch (error) {
		if (storageError(error).code !== "not_found") throw error;
		await storage
			.getS3Client()
			.send(
				new CreateBucketCommand({
					Bucket: config.bucket,
					...(config.client.region !== "us-east-1"
						? {
								CreateBucketConfiguration: {
									LocationConstraint: config.client.region as "eu-west-1",
								},
							}
						: {}),
				}),
			);
	}
	const origin = process.env.STORAGE_DEV_APP_ORIGIN || "http://localhost:3000";
	const url = new URL(origin);
	if (
		!["localhost", "127.0.0.1"].includes(url.hostname) ||
		url.origin !== origin
	)
		throw new Error("Development CORS requires an explicit loopback origin");
	await storage
		.getS3Client()
		.send(
			new PutBucketCorsCommand({
				Bucket: config.bucket,
				CORSConfiguration: {
					CORSRules: [
						{
							AllowedOrigins: [origin],
							AllowedMethods: ["GET", "PUT", "HEAD"],
							AllowedHeaders: ["content-type"],
							ExposeHeaders: ["ETag"],
							MaxAgeSeconds: 600,
						},
					],
				},
			}),
		);
	console.info("Development bucket and origin-specific CORS ready");
} catch (error) {
	console.error(storageError(error).toJSON());
	process.exitCode = 1;
} finally {
	storage.close();
}
