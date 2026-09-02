import {
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnModuleDestroy,
} from "@nestjs/common";

import { SubmitWagerTransactionUseCase } from "../../application/submit-wager-transaction.use-case.js";

const POLL_INTERVAL_MS = 30_000;
const BATCH_SIZE = 20;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

@Injectable()
export class PendingReferenceResolverWorker implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(PendingReferenceResolverWorker.name);
  private stopped = false;
  private loopPromise: Promise<void> | undefined;

  constructor(private readonly submitWagerTransactionUseCase: SubmitWagerTransactionUseCase) {}

  onApplicationBootstrap(): void {
    this.loopPromise = this.loop();
  }

  async onModuleDestroy(): Promise<void> {
    this.stopped = true;
    await this.loopPromise;
  }

  private async loop(): Promise<void> {
    while (!this.stopped) {
      try {
        const advanced = await this.submitWagerTransactionUseCase.retryDueReferences(
          new Date(),
          BATCH_SIZE,
        );
        if (advanced > 0) {
          this.logger.log(`${advanced} transação(ões) PENDING_REFERENCE reavaliada(s).`);
        }
      } catch (error) {
        this.logger.error(
          `Falha inesperada no ciclo de resolução de referências pendentes: ${String(error)}`,
        );
      }
      await sleep(POLL_INTERVAL_MS);
    }
  }
}
