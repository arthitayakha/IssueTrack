export interface CreateUserDto {
  email: string;
  password: string;
  name: string;
}

export interface LoginDto {
  email: string;
  password: string;
}

export interface CreateBoardDto {
  title: string;
  description: string;
}

export interface UpdateBoardDto {
  title?: string;
  description?: string;
}

export interface CreateColumnDto {
  title: string;
  order: number;
  boardId: string;
}

export interface UpdateColumnDto {
  title?: string;
  order?: number;
}

export interface CreateIssueDto {
  title: string;
  description: string;
  priority: "low" | "medium" | "high" | "urgent";
  columnId: string;
  assigneeId?: string;
}

export interface UpdateIssueDto {
  title?: string;
  description?: string;
  status?: string;
  priority?: "low" | "medium" | "high" | "urgent";
  order?: number;
  columnId?: string;
  assigneeId?: string | null;
}

export interface CreateCommentDto {
  content: string;
  issueId: string;
}

export interface UpdateCommentDto {
  content: string;
}

export interface CreateLabelDto {
  name: string;
  color: string;
  boardId: string;
}

export interface UpdateLabelDto {
  name?: string;
  color?: string;
}
