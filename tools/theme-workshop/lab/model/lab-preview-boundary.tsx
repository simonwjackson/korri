import { Component, type ErrorInfo, type ReactNode } from "react"

type Props = {
  readonly label: string
  readonly children: ReactNode
}

type State = { readonly error: Error | null }

export class LabPreviewBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`Lab preview failed: ${this.props.label}`, error, info)
  }

  render() {
    if (this.state.error) {
      return (
        <div role="alert" className="lab-preview-error">
          <strong>{this.props.label}</strong>
          <span>{this.state.error.message}</span>
        </div>
      )
    }
    return this.props.children
  }
}
