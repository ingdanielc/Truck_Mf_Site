export class ModelNotification {
    constructor(
      public medium?: string, // Opcional, por defecto "WhatsApp"
      public messageType?: string,
      public data: KeyValue[] = [],
      public recipients: string[] = [],
      public content?: string, // Opcional
      public phone?: string,
      public email?: string,
      public attachmentUrl?: string, // Opcional
      public subject?: string, // Opcional (para email)
    ) {}
  }

  export class KeyValue {
    constructor(
      public key?: string,
      public value?: string
    ) {}
  }