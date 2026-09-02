import { SQSClient } from "@aws-sdk/client-sqs";
import type { Provider } from "@nestjs/common";

import { buildSqsClientConfig } from "./sqs.config.js";

export const SQS_CLIENT = Symbol("SQS_CLIENT");

export const sqsClientProvider: Provider = {
  provide: SQS_CLIENT,
  useFactory: () => new SQSClient(buildSqsClientConfig()),
};
