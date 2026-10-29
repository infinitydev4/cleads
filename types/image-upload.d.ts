import type { JSX } from "react";
export interface ImageUploadProps {
  value: string | null
  onChange: (url: string) => void
  onRemove: () => void
}

export declare function ImageUpload(props: ImageUploadProps): JSX.Element 