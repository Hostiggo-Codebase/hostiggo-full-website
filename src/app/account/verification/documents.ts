export type IdDocument = {
  id: string;
  /** Label shown on the selection card. */
  label: string;
  /** Illustration shown on the selection card. */
  image: string;
  /** Modal heading, e.g. "Aadhaar verification". */
  verificationTitle: string;
  /** Number-field label, e.g. "Aadhaar Number". */
  numberLabel: string;
  /** Number-field placeholder. */
  numberPlaceholder: string;
  /** Upload-box placeholder. */
  uploadPlaceholder: string;
  /** Keyboard hint for the number field. */
  inputMode: 'numeric' | 'text';
  /** Max characters for the document number. */
  maxLength: number;
  /** Force the number to uppercase (PAN / passport). */
  uppercase?: boolean;
  /** Skip file upload (for passport number-only verification). */
  skipUpload?: boolean;
};

export const ID_DOCUMENTS: IdDocument[] = [
  {
    id: 'aadhaar',
    label: 'eAadhaar PDF',
    image: '/verification/aadhaar.png',
    verificationTitle: 'eAadhaar verification',
    numberLabel: '',
    numberPlaceholder: '',
    uploadPlaceholder: 'Upload your eAadhaar PDF',
    inputMode: 'text',
    maxLength: 0,
    skipUpload: false,
  },
  {
    id: 'pan',
    label: 'PAN Card',
    image: '/verification/pan.png',
    verificationTitle: 'PAN verification',
    numberLabel: 'PAN Card Number',
    numberPlaceholder: 'ABCDE1234F',
    uploadPlaceholder: '',
    inputMode: 'text',
    maxLength: 10,
    uppercase: true,
    skipUpload: true,
  },
  {
    id: 'passport',
    label: 'Passport',
    image: '/verification/passport.png',
    verificationTitle: 'Passport verification',
    numberLabel: 'Passport File Number',
    numberPlaceholder: 'Enter file number',
    uploadPlaceholder: '',
    inputMode: 'text',
    maxLength: 15,
    uppercase: true,
    skipUpload: true,
  },
];
