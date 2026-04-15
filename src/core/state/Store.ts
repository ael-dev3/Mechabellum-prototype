export type Reducer<State, Action> = (state: State, action: Action) => State;
export type Listener<State> = (state: State) => void;
export type ActionListener<State, Action> = (params: { action: Action; prevState: State }) => void;
export type ErrorListener<Action> = (params: { action: Action | null; error: unknown }) => void;

export class Store<State, Action> {
  private state: State;
  private readonly reducer: Reducer<State, Action>;
  private listeners: Array<Listener<State>> = [];
  private actionListeners: Array<ActionListener<State, Action>> = [];
  private errorListeners: Array<ErrorListener<Action>> = [];

  constructor(initialState: State, reducer: Reducer<State, Action>) {
    this.state = initialState;
    this.reducer = reducer;
  }

  public getState(): State {
    return this.state;
  }

  public dispatch(action: Action): void {
    const prevState = this.state;
    for (const listener of this.actionListeners) listener({ action, prevState });

    try {
      this.state = this.reducer(this.state, action);
    } catch (error) {
      for (const listener of this.errorListeners) listener({ action, error });
      throw error;
    }
    this.notify();
  }

  public dispatchBatch(actions: readonly Action[]): void {
    if (actions.length === 0) return;
    for (const action of actions) {
      const prevState = this.state;
      for (const listener of this.actionListeners) listener({ action, prevState });

      try {
        this.state = this.reducer(this.state, action);
      } catch (error) {
        for (const listener of this.errorListeners) listener({ action, error });
        throw error;
      }
    }
    this.notify();
  }

  public subscribe(listener: Listener<State>): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  }

  public subscribeActions(listener: ActionListener<State, Action>): () => void {
    this.actionListeners.push(listener);
    return () => {
      this.actionListeners = this.actionListeners.filter(l => l !== listener);
    };
  }

  public subscribeErrors(listener: ErrorListener<Action>): () => void {
    this.errorListeners.push(listener);
    return () => {
      this.errorListeners = this.errorListeners.filter(l => l !== listener);
    };
  }

  private notify(): void {
    for (const listener of this.listeners) {
      listener(this.state);
    }
  }
}
