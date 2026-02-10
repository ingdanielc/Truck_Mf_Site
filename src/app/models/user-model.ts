export class ModelUser {
  constructor(
    public id?: number | null,
    public name?: string,
    public email?: string,
    public password?: string,
    public userRoles: ModelUserRoles[] = [new ModelUserRoles()],
    public status?: string
  ) {}
}

export class ModelUserRoles {
  constructor(
    public user?: number | null,
    public role: ModelRole = new ModelRole()
  ) {}
}

export class ModelRole {
  constructor(public id?: number | null, public name?: string) {}
}
