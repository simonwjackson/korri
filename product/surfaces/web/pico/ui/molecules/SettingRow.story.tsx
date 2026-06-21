import type { StorySpec } from "../../story-spec"
import { Badge } from "../atoms/Badge"
import { SettingRow } from "./SettingRow"

export default {
  render: () => (
    <div className="pcSet-list">
      <SettingRow label="Scanlines" state="selected">
        <Badge tone="good">ON</Badge>
      </SettingRow>
      <SettingRow label="Aspect">
        <span className="pcSet-info">4:3</span>
      </SettingRow>
    </div>
  ),
} satisfies StorySpec
