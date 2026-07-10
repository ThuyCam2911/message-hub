import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { ChannelAdapter } from './channel-adapter.interface';
import { CHANNEL_ADAPTERS } from './tokens';

/**
 * The single seam through which the FailoverEngine and API resolve a
 * ChannelAdapter by strategy_key. Never import a concrete adapter class
 * outside of this module's providers.
 */
@Injectable()
export class ChannelAdapterRegistry implements OnModuleInit {
  private readonly byStrategyKey = new Map<string, ChannelAdapter>();

  constructor(@Inject(CHANNEL_ADAPTERS) private readonly adapters: ChannelAdapter[]) {}

  onModuleInit() {
    for (const adapter of this.adapters) {
      if (this.byStrategyKey.has(adapter.strategyKey)) {
        throw new Error(`Duplicate ChannelAdapter registration for strategyKey "${adapter.strategyKey}"`);
      }
      this.byStrategyKey.set(adapter.strategyKey, adapter);
    }
  }

  get(strategyKey: string): ChannelAdapter {
    const adapter = this.byStrategyKey.get(strategyKey);
    if (!adapter) {
      throw new Error(`No ChannelAdapter registered for strategyKey "${strategyKey}"`);
    }
    return adapter;
  }

  list(): ChannelAdapter[] {
    return [...this.byStrategyKey.values()];
  }
}
