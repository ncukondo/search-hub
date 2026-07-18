import { MultiBar, Presets, type SingleBar } from 'cli-progress';

export type ProgressStatus = 'pending' | 'in_progress' | 'completed' | 'failed' | 'partial';

export interface ProviderState {
  provider: string;
  current: number;
  total: number;
  status: ProgressStatus;
  error?: string;
}

const STATUS_ICONS: Record<ProgressStatus, string> = {
  completed: '\u2713', // ✓
  failed: '\u2717', // ✗
  in_progress: '\u280B', // ⠋
  pending: '\u25FC', // ◼
  partial: '\u26A0', // ⚠
};

export class MultiProviderProgress {
  private multibar: MultiBar;
  private bars: Map<string, SingleBar>;
  private states: Map<string, ProviderState>;

  constructor(providers: string[]) {
    this.multibar = new MultiBar(
      {
        clearOnComplete: false,
        hideCursor: true,
        format: '{icon} {provider} [{bar}] {value}/{total} {statusText}',
        barCompleteChar: '\u2588', // █
        barIncompleteChar: '\u2591', // ░
      },
      Presets.shades_classic,
    );

    this.bars = new Map();
    this.states = new Map();

    for (const provider of providers) {
      const bar = this.multibar.create(0, 0, {
        icon: STATUS_ICONS.pending,
        provider: provider.padEnd(10),
        statusText: 'waiting...',
      });
      this.bars.set(provider, bar);
      this.states.set(provider, {
        provider,
        current: 0,
        total: 0,
        status: 'pending',
      });
    }
  }

  update(provider: string, current: number, total: number, status: ProgressStatus): void {
    const bar = this.bars.get(provider);
    const state = this.states.get(provider);
    if (!bar || !state) return;

    state.current = current;
    state.total = total;
    state.status = status;

    bar.setTotal(total);
    bar.update(current, {
      icon: STATUS_ICONS[status],
      provider: provider.padEnd(10),
      statusText: this.getStatusText(status),
    });
  }

  complete(provider: string): void {
    const bar = this.bars.get(provider);
    const state = this.states.get(provider);
    if (!bar || !state) return;

    state.status = 'completed';
    bar.update(state.current, {
      icon: STATUS_ICONS.completed,
      provider: provider.padEnd(10),
      statusText: 'completed',
    });
  }

  fail(provider: string, error: string): void {
    const bar = this.bars.get(provider);
    const state = this.states.get(provider);
    if (!bar || !state) return;

    state.status = 'failed';
    state.error = error;
    bar.update(state.current, {
      icon: STATUS_ICONS.failed,
      provider: provider.padEnd(10),
      statusText: `failed: ${error}`,
    });
  }

  partial(provider: string): void {
    const bar = this.bars.get(provider);
    const state = this.states.get(provider);
    if (!bar || !state) return;

    state.status = 'partial';
    bar.update(state.current, {
      icon: STATUS_ICONS.partial,
      provider: provider.padEnd(10),
      statusText: 'partial',
    });
  }

  stop(): void {
    this.multibar.stop();
  }

  getState(provider: string): ProviderState | undefined {
    return this.states.get(provider);
  }

  getAllStates(): ProviderState[] {
    return Array.from(this.states.values());
  }

  static getIcon(status: ProgressStatus): string {
    return STATUS_ICONS[status];
  }

  private getStatusText(status: ProgressStatus): string {
    switch (status) {
      case 'completed':
        return 'completed';
      case 'failed':
        return 'failed';
      case 'in_progress':
        return '';
      case 'pending':
        return 'waiting...';
      case 'partial':
        return 'partial';
      default:
        return '';
    }
  }
}
