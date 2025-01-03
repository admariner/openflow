import { Base, Rights } from "@openiap/nodeapi";
import { Customer, Role, User } from "@openiap/openflow-api";
import { Span } from "@opentelemetry/api";
import { Config } from "../Config.js";
import { Crypt } from "../Crypt.js";
import { Logger } from "../Logger.js";

export class Member extends Base {
    constructor() {
        super();
        this._type = "member";
        this.seen = false;
        this.status = "pending";
        this.role = "member";
    }
    public email: string;
    public userid: string;
    public workspaceid: string;
    public workspacename: string;
    public status: "pending" | "accepted" | "rejected";
    public role: "member" | "admin";
    public invitedby: string;
    public invitedbyname: string;
    public invitedon: Date;
    public token: string;
    public expires: Date;
    public seen: boolean;
    public seenon: Date;
    public acceptedby: string;
    public acceptedbyname: string;
    public acceptedon: Date;
    public rejectedby: string;
    public rejectedbyname: string;
    public rejectedon: Date;

}
export class Billing extends Base {
    constructor() {
        super();
        this._type = "billing";
    }
    public billing: string;
    public admins: string;
    public stripeid: string;
}
export class Workspace extends Base {
    constructor() {
        super();
        this._type = "workspace";
    }
    public billingid: string;
    public admins: string;
    public users: string;
    public price: string;
}
export class Workspaces {
    public static async EnsureWorkspace(tuser: User, jwt: string, workspace: Workspace, parent: Span): Promise<Workspace> {
        if(Config.workspace_enabled == false) throw new Error("Workspaces are not enabled");
        if (!Logger.License.validlicense) await Logger.License.validate();
        if(tuser == null) throw new Error("User is mandatory");
        if(tuser._id == "65cb30c40ff51e174095573c") throw new Error("Guest is not allowed to create workspaces");
        if(workspace == null) throw new Error("Workspace is mandatory");
        if(workspace.name == null || workspace.name == "") throw new Error("Name is mandatory");
        if(tuser == null) throw new Error("User is mandatory");
        if(jwt == null || jwt == "") throw new Error("JWT is mandatory");
        const rootjwt = Crypt.rootToken();
        let workspaceadmins:Role = null;
        let workspaceusers:Role = null;
        workspace._type = "workspace";
        if(workspace._id != null && workspace._id != "") {
            const _workspace = await Config.db.GetOne<Workspace>({ query: { _id: workspace._id, "_type": "workspace" }, collectionname: "users", jwt }, parent);
            if(_workspace == null) throw new Error("Workspace not found");
        } else {
            // const _workspace = await Config.db.GetOne<Workspace>({ query: { name: workspace.name, "_type": "workspace" }, collectionname: "users", jwt: rootjwt }, parent);
            // if(_workspace != null) throw new Error("Workspace already exists");
        }

        workspaceadmins = await Logger.DBHelper.EnsureUniqueRole(workspace.name + " admins", workspace.admins, parent);
        workspaceusers = await Logger.DBHelper.EnsureUniqueRole(workspace.name + " users", workspace.users, parent);
        if(workspace._id != null && workspace._id != "") {
            if(!tuser.HasRoleName("admins")) {
                if(!workspaceadmins.IsMember(tuser._id)) throw new Error("User is not a member of the workspace admins");
            }
        } else {
            Base.addRight(workspaceadmins, workspaceadmins._id, workspaceadmins.name, [Rights.read]);
            Base.addRight(workspaceadmins, workspaceadmins._id, workspaceadmins.name, [Rights.read]);
            workspaceadmins.AddMember(tuser);
            Base.addRight(workspaceusers, workspaceadmins._id, workspaceadmins.name, [Rights.read]);
            Base.addRight(workspaceusers, workspaceusers._id, workspaceusers.name, [Rights.read]);
            workspaceusers.AddMember(workspaceadmins);
            workspaceusers.AddMember(tuser);
        }

        Base.removeRight(workspaceadmins, workspaceadmins._id, [Rights.full_control]);
        Base.addRight(workspaceadmins, workspaceadmins._id, workspaceadmins.name, [Rights.read]);
        Base.removeRight(workspaceadmins, workspaceusers._id, [Rights.full_control]);
        Base.addRight(workspaceadmins, workspaceusers._id, workspaceusers.name, [Rights.read]);
        await Logger.DBHelper.Save(workspaceadmins, rootjwt, parent);
        Base.removeRight(workspaceusers, workspaceadmins._id, [Rights.full_control]);
        Base.addRight(workspaceusers, workspaceadmins._id, workspaceadmins.name, [Rights.read]);
        Base.removeRight(workspaceusers, workspaceusers._id, [Rights.full_control]);
        Base.addRight(workspaceusers, workspaceusers._id, workspaceusers.name, [Rights.read]);
        await Logger.DBHelper.Save(workspaceusers, rootjwt, parent);

        Base.addRight(workspace, workspaceadmins._id, workspaceadmins.name, [Rights.read]);
        Base.addRight(workspace, workspaceusers._id, workspaceusers.name, [Rights.read]);
        workspace.admins = workspaceadmins._id;
        workspace.users = workspaceusers._id;
        const result = await Config.db.InsertOrUpdateOne2(workspace, "users", "_id", 1, true, rootjwt, parent);

        let member = await Config.db.GetOne<Member>({collectionname: "users", query: {userid: tuser._id, workspaceid: result._id, "_type": "member"}}, parent);
        if(member == null) {
            member = new Member();
            member._type = "member";
            member.email = tuser.email;
            member.userid = tuser._id;
            member.name = tuser.name;
            member.invitedby = tuser._id;
            member.invitedbyname = tuser.name;
            member.invitedon = new Date();
            member.status = "accepted";
            member.role = "admin";
            member.workspaceid = result._id;
            member.workspacename = result.name;
            member.expires = new Date();
            member.seen = true;
            member.seenon = new Date();
            member.acceptedby = tuser._id;
            member.acceptedbyname = tuser.name;
            member.acceptedon = new Date();
            member.token = Crypt.GetUniqueIdentifier(32);
            Base.addRight(member, tuser._id, tuser.name, [Rights.read]);
            Base.addRight(member, workspace.admins, workspace.name + " admins", [Rights.read]);
            Base.addRight(member, workspace.users, workspace.name + " users", [Rights.read]);
            await Config.db.InsertOne(member, "users", 1, true, rootjwt, parent);
        }
        return result;
    }
    public static async DeleteWorkspace(tuser: User, jwt: string, id: string, parent: Span): Promise<void> {
        if(Config.workspace_enabled == false) throw new Error("Workspaces are not enabled");
        if (!Logger.License.validlicense) await Logger.License.validate();
        if(id == null || id == "") throw new Error("ID is mandatory");
        if(tuser == null) throw new Error("User is mandatory");
        if(tuser._id == "65cb30c40ff51e174095573c") throw new Error("Guest is not allowed to delete workspaces");
        if(jwt == null || jwt == "") throw new Error("JWT is mandatory");
        const rootjwt = Crypt.rootToken();
        const _workspace = await Config.db.GetOne<Workspace>({ query: { _id: id, "_type": "workspace" }, collectionname: "users", jwt }, parent);
        if(_workspace == null) throw new Error("Workspace not found");
        if(!tuser.HasRoleName("admins")) {
            let _workspaceadmins = await Config.db.GetOne<Role>({ query: { _id: _workspace.admins, "_type": "role" }, collectionname: "users", jwt }, parent);
            if(_workspaceadmins != null) {
                _workspaceadmins = Role.assign(_workspaceadmins);
                if(!_workspaceadmins.IsMember(tuser._id)) throw new Error("User is not a member of the workspace admins");
            }
        }
        await Config.db.DeleteOne(id, "users", false, rootjwt, parent);
        await Config.db.DeleteOne(_workspace.admins, "users", false, rootjwt, parent);
        await Config.db.DeleteOne(_workspace.users, "users", false, rootjwt, parent);
        await Config.db.DeleteMany(JSON.stringify({ workspaceid: id, "_type": "member" }), null, "users", "", false, rootjwt, parent);
    }
    public static async InviteUserToWorkspace(tuser: User, jwt: string, email: string, workspaceid: string, role: "member" | "admin", parent: Span): Promise<Member> {
        if(Config.workspace_enabled == false) throw new Error("Workspaces are not enabled");
        if (!Logger.License.validlicense) await Logger.License.validate();
        if(email == null || email == "") throw new Error("Email is mandatory");
        if(workspaceid == null || workspaceid == "") throw new Error("Workspace ID is mandatory");
        email = email.toLowerCase();
        if(role != "member" && role != "admin") throw new Error("Invalid role");
        if(tuser == null) throw new Error("Invitee user is mandatory");
        if(tuser._id == "65cb30c40ff51e174095573c") throw new Error("Guest is not allowed to invite users");
        if(jwt == null || jwt == "") throw new Error("Invitee JWT is mandatory");
        const workspace = await Config.db.GetOne<Customer>({ query: { _id: workspaceid, _type: "workspace" }, collectionname: "users", jwt }, parent);
        if(workspace == null) throw new Error("Workspace not found");
        const _workspaceadmins = await Config.db.GetOne<Role>({ query: { _id: workspace.admins, "_type": "role" }, collectionname: "users", jwt }, parent);
        if(_workspaceadmins == null) throw new Error("workspace admins not found");
        const _workspaceusers = await Config.db.GetOne<Role>({ query: { _id: workspace.users, "_type": "role" }, collectionname: "users", jwt }, parent);
        if(_workspaceusers == null) throw new Error("workspace users not found");
        const workspaceusers:Role = Role.assign(_workspaceusers);

        // const workspaceadmins:Role = Role.assign(_workspaceadmins);
        // if(!workspaceadmins.IsMember(tuser._id)) throw new Error("User is not a member of the workspace");
        if(!workspaceusers.IsMember(tuser._id)) throw new Error("User is not a member of the workspace");


        const rootjwt = Crypt.rootToken();
        const byid = { $or: [{"email": email}, {"username": email}, { "federationids.id": email, "federationids.issuer": email }, { "federationids": email }] };
        const user = await Config.db.GetOne<User>({ query: { ...byid, _type: "user"}, collectionname: "users", jwt: rootjwt }, parent);

        let exists: any[] = [{email: email}];
        if(user != null) exists.push({userid: user._id});
        const query = { $or: exists, workspaceid: workspaceid, "_type": "member" };
        let member = await Config.db.GetOne<Member>({ query, collectionname: "users", jwt: rootjwt }, parent);
        if(member == null) {
            member = new Member();
            member._type = "member";
            member.email = email;
            member.name = "Invite for " + email + " to " + workspace.name;
        } else {
            if(member.status == "accepted") throw new Error("User is already a member of the workspace");
            if(member.status == "rejected") {
                throw new Error("User has rejected the invite");
            }
            if(member.expires < new Date()) {
                member.expires = new Date(new Date().getTime() + 3 * 24 * 60 * 60 * 1000); // 3 days
                member.token = Crypt.GetUniqueIdentifier(32);
            } else {
                if(member.role == role) {
                    throw new Error("User has allready been Invited, please wait for the user to accept or reject the invite");
                }                
            }
        }
        Base.addRight(member, tuser._id, tuser.name, [Rights.read]);
        Base.addRight(member, workspace.admins, workspace.name + " admins", [Rights.read]);
        Base.addRight(member, workspace.users, workspace.name + " users", [Rights.read]);
        member.userid = "";
        member.status = "pending"; // pending, accepted, rejected
        if(user != null) {
            Base.addRight(member, user._id, user.name, [Rights.read]);
            member.userid = user._id;
            if(!workspaceusers.IsMember(user._id)) {
                member.name = user.name;
                // member.status = "accepted";
            } else {
                member.name = user.name;
                member.status = "accepted";
                member.acceptedby = user._id;
                member.acceptedbyname = user.name;
                member.acceptedon = new Date();
            }
        }
        member.workspaceid = workspaceid;
        member.workspacename = workspace.name;
        member.role = role;
        member.invitedby = tuser._id;
        member.invitedbyname = tuser.name;
        member.invitedon = new Date();
        member.token = Crypt.GetUniqueIdentifier(32);
        member.expires = new Date(new Date().getTime() + 3 * 24 * 60 * 60 * 1000); // 3 days
        if(member._id != null && member._id != "") {
            const result = await Config.db._UpdateOne(null, member, "users", 1, true, rootjwt, parent);
            return result;
        }
        const result = await Config.db.InsertOne(member, "users", 1, true, rootjwt, parent);
        return result;
}
    public static async GetInvite(user: User, jwt: string, token: string, parent: Span): Promise<Member> {
        if(Config.workspace_enabled == false) throw new Error("Workspaces are not enabled");
        if (!Logger.License.validlicense) await Logger.License.validate();
        if(user == null) throw new Error("User is mandatory");
        if(jwt == null || jwt == "") throw new Error("JWT is mandatory");
        if(token == null || token == "") throw new Error("Token is mandatory");
        const rootjwt = Crypt.rootToken();
        const member = await Config.db.GetOne<Member>({ query: { token, "_type": "member" }, collectionname: "users", jwt: rootjwt }, parent);
        if(member == null) throw new Error("Invite not found");
        if(member.expires < new Date()) throw new Error("Invite expired");
        // if(member.status != "pending") throw new Error("Invite is not pending (" + member.status + ")");
        if(member.userid != "" && member.userid != user._id) throw new Error("Invite is for another user");
        if(member.seen == false) {
            member.seen = true;
            member.seenon = new Date();
            await Config.db._UpdateOne(null, member, "users", 1, true, rootjwt, parent);
        }
        return member;
    }
    public static async AcceptInvite(user: User, jwt: string, token: string, parent: Span): Promise<Member> {
        if(Config.workspace_enabled == false) throw new Error("Workspaces are not enabled");
        if (!Logger.License.validlicense) await Logger.License.validate();
        if(user == null) throw new Error("User is mandatory");
        if(jwt == null || jwt == "") throw new Error("JWT is mandatory");
        if(token == null || token == "") throw new Error("Token is mandatory");
        const rootjwt = Crypt.rootToken();
        const member = await Config.db.GetOne<Member>({ query: { token, "_type": "member" }, collectionname: "users", jwt: rootjwt }, parent);
        if(member == null) throw new Error("Invite not found");
        if(member.expires < new Date()) throw new Error("Invite expired");
        // if(member.status != "pending") throw new Error("Invite is not pending (" + member.status + ")");
        if(member.status == "accepted") throw new Error("Invite is already accepted");
        if(member.userid != "" && member.userid != user._id) throw new Error("Invite is for another user");
        if(user._id == "65cb30c40ff51e174095573c" && member.userid != "65cb30c40ff51e174095573c") throw new Error("Guest is not allowed to accept invites");
        member.userid = user._id;
        Base.addRight(member, user._id, user.name, [Rights.read]);
        const workspace = await Config.db.GetOne<Workspace>({ query: { _id: member.workspaceid, "_type": "workspace" }, collectionname: "users", jwt: rootjwt }, parent);
        let workspaceusers = await Config.db.GetOne<Role>({ query: { _id: workspace.users, "_type": "role" }, collectionname: "users", jwt: rootjwt }, parent);
        workspaceusers = Role.assign(workspaceusers);
        let workspaceadmins = await Config.db.GetOne<Role>({ query: { _id: workspace.admins, "_type": "role" }, collectionname: "users", jwt: rootjwt }, parent);
        workspaceadmins = Role.assign(workspaceadmins);
        // if(workspaceusers.IsMember(user._id)) throw new Error("User is already a member of the workspace");
        if(!workspaceusers.IsMember(user._id)) {
            workspaceusers.AddMember(user);
            await Logger.DBHelper.Save(workspaceusers, rootjwt, parent);
        }
        if(member.role == "admin") {
            if(!workspaceadmins.IsMember(user._id)) {
                workspaceadmins.AddMember(user);
                await Logger.DBHelper.Save(workspaceadmins, rootjwt, parent);
            }
        } else {
            if(workspaceadmins.IsMember(user._id)) {
                workspaceadmins.RemoveMember(user._id);
                await Logger.DBHelper.Save(workspaceadmins, rootjwt, parent);
            }
        }
        member.name = user.name;
        member.status = "accepted";
        member.acceptedby = user._id;
        member.acceptedbyname = user.name;
        member.acceptedon = new Date();
        const result = await Config.db._UpdateOne(null, member, "users", 1, true, rootjwt, parent);
        return result;
    }
    public static async DeclineInvite(user: User, jwt: string, token: string, parent: Span): Promise<Member> {
        if(Config.workspace_enabled == false) throw new Error("Workspaces are not enabled");
        if (!Logger.License.validlicense) await Logger.License.validate();
        if(user == null) throw new Error("User is mandatory");
        if(jwt == null || jwt == "") throw new Error("JWT is mandatory");
        if(token == null || token == "") throw new Error("Token is mandatory");
        const rootjwt = Crypt.rootToken();
        const member = await Config.db.GetOne<Member>({ query: { token, "_type": "member" }, collectionname: "users", jwt: rootjwt }, parent);
        if(member == null) throw new Error("Invite not found");
        if(member.expires < new Date()) throw new Error("Invite expired");
        if(member.status != "pending") throw new Error("Invite is not pending (" + member.status + ")");
        if(member.userid != "" && member.userid != user._id) throw new Error("Invite is for another user");
        if(user._id == "65cb30c40ff51e174095573c" && member.userid != "65cb30c40ff51e174095573c") throw new Error("Guest is not allowed to decline invites");
        member.userid = user._id;
        Base.addRight(member, user._id, user.name, [Rights.read]);

        const workspace = await Config.db.GetOne<Workspace>({ query: { _id: member.workspaceid, "_type": "workspace" }, collectionname: "users", jwt: rootjwt }, parent);
        let workspaceusers = await Config.db.GetOne<Role>({ query: { _id: workspace.users, "_type": "role" }, collectionname: "users", jwt: rootjwt }, parent);
        workspaceusers = Role.assign(workspaceusers);
        let workspaceadmins = await Config.db.GetOne<Role>({ query: { _id: workspace.admins, "_type": "role" }, collectionname: "users", jwt: rootjwt }, parent);
        workspaceadmins = Role.assign(workspaceadmins);

        if(member.userid != "" && workspaceusers.IsMember(user._id)) {
            workspaceusers.RemoveMember(user._id);
            await Logger.DBHelper.Save(workspaceusers, rootjwt, parent);
        }
        if(member.userid != "" && workspaceadmins.IsMember(user._id)) {
            workspaceadmins.RemoveMember(user._id);
            await Logger.DBHelper.Save(workspaceadmins, rootjwt, parent);
        }
        member.status = "rejected";
        member.rejectedby = user._id;
        member.rejectedbyname = user.name;
        member.rejectedon = new Date();
        const result = await Config.db._UpdateOne(null, member, "users", 1, true, rootjwt, parent);
        return result;
    }
    public static async RemoveMember(user: User, jwt: string, id: string, parent: Span): Promise<void> {
        if(Config.workspace_enabled == false) throw new Error("Workspaces are not enabled");
        if (!Logger.License.validlicense) await Logger.License.validate();
        if(id == null || id == "") throw new Error("ID is mandatory");
        if(user == null) throw new Error("User is mandatory");
        if(user._id == "65cb30c40ff51e174095573c") throw new Error("Guest is not allowed to remove members");
        if(jwt == null || jwt == "") throw new Error("JWT is mandatory");
        const rootjwt = Crypt.rootToken();
        const member = await Config.db.GetOne<Member>({ query: { _id: id, "_type": "member" }, collectionname: "users", jwt }, parent);
        if(member == null) throw new Error("Member not found");
        
        const workspace = await Config.db.GetOne<Workspace>({ query: { _id: member.workspaceid, "_type": "workspace" }, collectionname: "users", jwt: rootjwt }, parent);
        if(workspace == null) throw new Error("Workspace not found");
        let workspaceusers = await Config.db.GetOne<Role>({ query: { _id: workspace.users, "_type": "role" }, collectionname: "users", jwt: rootjwt }, parent);
        workspaceusers = Role.assign(workspaceusers);
        let workspaceadmins = await Config.db.GetOne<Role>({ query: { _id: workspace.admins, "_type": "role" }, collectionname: "users", jwt: rootjwt }, parent);
        workspaceadmins = Role.assign(workspaceadmins);
        if(!user.HasRoleName("admins")) {
            if(!workspaceadmins.IsMember(user._id) && member.userid != user._id) {
                throw new Error("User is not a member of the workspace admins");
            }
        }
        if(member.role == "admin") {
            let membercount = await Config.db.count({ query: { workspaceid: member.workspaceid, "_type": "member", "role": "admin", "status": "accepted" }, collectionname: "users", jwt: rootjwt }, parent);
            if(membercount == 1) {
                throw new Error("You cannot remove the last admin member of a workspace, remove the workspace instead");
            }
        }
        if(workspaceusers.IsMember(member.userid)) {
            workspaceusers.RemoveMember(member.userid);
            await Logger.DBHelper.Save(workspaceusers, rootjwt, parent);
        }
        if(workspaceadmins.IsMember(member.userid)) {
            workspaceadmins.RemoveMember(member.userid);
            await Logger.DBHelper.Save(workspaceadmins, rootjwt, parent);
        }
        await Config.db.DeleteOne(id, "users", false, rootjwt, parent);
    }
    public static async UpdateMember(user: User, jwt: string, member: Member, parent: Span): Promise<Member> {
        if(Config.workspace_enabled == false) throw new Error("Workspaces are not enabled");
        if(member == null) throw new Error("Member is mandatory");
        const id = member._id;
        if(id == null || id == "") throw new Error("ID is mandatory");
        if(user == null) throw new Error("User is mandatory");
        if(user._id == "65cb30c40ff51e174095573c") throw new Error("Guest is not allowed to update members");
        if(jwt == null || jwt == "") throw new Error("JWT is mandatory");
        const rootjwt = Crypt.rootToken();
        const existing = await Config.db.GetOne<Member>({ query: { _id: member._id, "_type": "member" }, collectionname: "users", jwt: rootjwt }, parent);
        if(existing == null) throw new Error("Member not found");
        if(member.status != "accepted" && member.status != "pending" && member.status != "rejected") throw new Error("Invalid status");
        if(member.role != "admin" && member.role != "member") throw new Error("Invalid role");
        
        const workspace = await Config.db.GetOne<Workspace>({ query: { _id: member.workspaceid, "_type": "workspace" }, collectionname: "users", jwt: rootjwt }, parent);
        if(workspace == null) throw new Error("Workspace not found");
        let workspaceusers = await Config.db.GetOne<Role>({ query: { _id: workspace.users, "_type": "role" }, collectionname: "users", jwt: rootjwt }, parent);
        workspaceusers = Role.assign(workspaceusers);
        let workspaceadmins = await Config.db.GetOne<Role>({ query: { _id: workspace.admins, "_type": "role" }, collectionname: "users", jwt: rootjwt }, parent);
        workspaceadmins = Role.assign(workspaceadmins);
        if(!user.HasRoleName("admins")) {
            if(!workspaceadmins.IsMember(user._id)) {
                throw new Error("Access denied, you are not a member of the workspace admins");
            }
        }
        if(member.role == "member") {
            let membercount = await Config.db.count({ query: { workspaceid: member.workspaceid, "_type": "member", "role": "admin", "status": "accepted" }, collectionname: "users", jwt: rootjwt }, parent);
            if(membercount == 1) {
                throw new Error("You cannot demote the last admin member of a workspace, remove the workspace instead");
            }
        }
        let memberuser = await Config.db.GetOne<User>({ query: { _id: member.userid, "_type": "user" }, collectionname: "users", jwt: rootjwt }, parent);
        if(!workspaceusers.IsMember(memberuser._id)) {
            workspaceusers.AddMember(memberuser);
            await Logger.DBHelper.Save(workspaceusers, rootjwt, parent);
        }
        if(member.role == "admin") {
            if(!workspaceadmins.IsMember(memberuser._id)) {
                workspaceadmins.AddMember(memberuser);
                await Logger.DBHelper.Save(workspaceadmins, rootjwt, parent);
            }
        } else {
            if(workspaceadmins.IsMember(memberuser._id)) {
                workspaceadmins.RemoveMember(memberuser._id);
                await Logger.DBHelper.Save(workspaceadmins, rootjwt, parent);
            }
        }
        existing.status = member.status;
        existing.role = member.role;
        const result = await Config.db._UpdateOne(null, existing, "users", 1, true, rootjwt, parent);
        return result;
    }
}