import Layout from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card-hover-effect";
import { useGlobalState } from "@/hooks";
import useDeploymentManager from "@/hooks/useDeploymentManager";
import { Github, LinkIcon, Loader } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/router";
import { useEffect, useState } from "react";
import axios from "axios";
import { BUILDER_BACKEND } from "@/lib/utils";
import Ansi from "@agbishop/react-ansi-18";
import { connect } from "@permaweb/aoconnect";
import { toast } from "sonner";
import { runLua } from "@/lib/ao-vars";

export default function Deployment() {
    const globalState = useGlobalState();
    const { managerProcess, deployments, refresh } = useDeploymentManager();
    const router = useRouter();
    const name = router.query.name;
    const [buildOutput, setBuildOutput] = useState("");
    const [antName, setAntName] = useState("");
    const [redeploying, setRedeploying] = useState(false);
    const [deploymentUrl, setDeploymentUrl] = useState("");
    const [error, setError] = useState<string | null>(null);

    const deployment = globalState.deployments.find((dep) => dep.Name == name);

    useEffect(() => {
        if (!deployment?.RepoUrl) return;
        const fetchDeploymentUrl = async () => {
            const owner = deployment.RepoUrl.split("/").reverse()[1];
            const repoName = deployment.RepoUrl.split("/").reverse()[0].replace(".git", "");
            try {
                const response = await axios.get(`${BUILDER_BACKEND}/config/${owner}/${repoName}`);
                setDeploymentUrl(response.data.url);
            } catch (error) {
                console.error("Error fetching deployment URL:", error);
                toast.error("Failed to fetch deployment URL");
                setError("Failed to fetch deployment URL. Please try again later.");
            }
        };
        fetchDeploymentUrl();
    }, [deployment]);

    useEffect(() => {
        if (!deployment?.RepoUrl) return
        const interval: ReturnType<typeof setInterval> = setInterval(async () => {
            const folderName = deployment?.RepoUrl.replace(/\.git|\/$/, '').split('/').pop() as string;
            const owner = deployment?.RepoUrl.split("/").reverse()[1];
            if (!redeploying) return clearInterval(interval)
            try {
                const logs = await axios.get(`${BUILDER_BACKEND}/logs/${owner}/${folderName}`)
                console.log(logs.data)
                setBuildOutput((logs.data as string).replaceAll(/\\|\||\-/g, ""))
                //scroll logs to bottom
                setTimeout(() => {
                    const logsDiv = document.getElementById("logs");
                    logsDiv?.scrollTo({ top: logsDiv.scrollHeight, behavior: "smooth" });
                }, 100)
            } catch (error) {
                console.error("Error fetching logs:", error);
                setError("Failed to fetch build logs. Please try again later.");
            }
        }, 1000)

        return () => { clearInterval(interval) }
    }, [redeploying, deployment?.RepoUrl])

    const redeploy = async () => {
        if (!deployment) return;
        const projName = deployment.Name;
        const repoUrl = deployment.RepoUrl;
        const installCommand = deployment.InstallCMD;
        const buildCommand = deployment.BuildCMD;
        const outputDir = deployment.OutputDIR;
        const arnsProcess = deployment.ArnsProcess;
        const branch = deployment.Branch || "main";
        setRedeploying(true);
        setBuildOutput("");
        setError(null);
        try {
            const txid = await axios.post(`${BUILDER_BACKEND}/deploy`, {
                repository: repoUrl,
                branch,
                installCommand,
                buildCommand,
                outputDir,
            });

            if (txid.status == 200) {
                toast.success("Deployment successful");

                const mres = await runLua("", arnsProcess, [
                    { name: "Action", value: "Set-Record" },
                    { name: "Sub-Domain", value: "@" },
                    { name: "Transaction-Id", value: txid.data },
                    { name: "TTL-Seconds", value: "3600" },
                ]);

                const updres = await runLua(`db:exec[[UPDATE Deployments SET DeploymentId='${txid.data}' WHERE Name='${projName}']]`, globalState.managerProcess);

                router.push("/deployments/" + projName);
                await refresh();
                window.open("https://arweave.net/" + txid.data, "_blank");

                setRedeploying(false);
            } else {
                toast.error("Deployment failed");
                console.log(txid);
                setRedeploying(false);
                setError("Deployment failed. Please try again.");
            }
        } catch (error) {
            toast.error("Deployment failed");
            console.log(error);
            setRedeploying(false);
            setError("An error occurred during deployment. Please try again later.");
        }
    };

    useEffect(() => {
        refresh();
    }, []);

    useEffect(() => {
        if (!deployment) return;
        const owner = deployment?.RepoUrl.split("/").reverse()[1];
        const folderName = deployment?.RepoUrl.replace(/\.git|\/$/, '').split('/').pop() as string;
        axios.get(`${BUILDER_BACKEND}/logs/${owner}/${folderName}`)
            .then((res) => {
                setBuildOutput((res.data as string).replaceAll(/\\|\||\-/g, ""));
            })
            .catch((error) => {
                console.error("Error fetching logs:", error);
                setError("Failed to fetch build logs. Please try again later.");
            });

        connect().dryrun({
            process: deployment?.ArnsProcess,
            tags: [{ name: "Action", value: "Info" }]
        }).then(r => {
            if (r.Messages && r.Messages.length > 0) {
                const d = JSON.parse(r.Messages[0].Data);
                console.log(d);
                setAntName(d.Name);
            } else {
                console.error("No messages received or messages array is empty");
                setError("Failed to fetch ArNS information. Please try again later.");
            }
        }).catch(error => {
            console.error("Error during dryrun:", error);
            setError("An error occurred while fetching ArNS information. Please try again later.");
        });
    }, [deployment]);

    async function deleteDeployment() {
        if (!deployment) return toast.error("Deployment not found");

        if (!globalState.managerProcess) return toast.error("Manager process not found");

        const query = `local res = db:exec[[
            DELETE FROM Deployments
            WHERE Name = '${deployment.Name}'
        ]]`;
        console.log(query);

        try {
            const res = await runLua(query, globalState.managerProcess);
            if (res.Error) {
                toast.error(res.Error);
                setError("Failed to delete deployment. Please try again.");
                return;
            }
            console.log(res);
            await refresh();

            toast.success("Deployment deleted successfully");
            router.push("/dashboard");
        } catch (error) {
            console.error("Error deleting deployment:", error);
            toast.error("An error occurred while deleting the deployment");
            setError("Failed to delete deployment. Please try again later.");
        }
    }

    if (!deployment) return <Layout>
        <div className="text-xl">Searching <span className="text-muted-foreground">{name} </span> ...</div>
    </Layout>;

    return <Layout>
        <div className="text-xl">{deployment?.Name}</div>
        {error && <div className="text-red-500 mb-4">{error}</div>}
        <Button className="w-fit absolute right-10" onClick={redeploy} disabled={redeploying}>
            Deploy Latest <Loader className={redeploying ? "animate-spin" : "hidden"} />
        </Button>
        <Link href={deployment?.RepoUrl || ""} target="_blank" className="w-fit flex items-center gap-1 my-2 hover:underline underline-offset-4"><Github size={24} />{deployment?.RepoUrl}</Link>
        <Link href={`https://arweave.net/${deploymentUrl}`} target="_blank" className="w-fit flex items-center gap-1 my-2 hover:underline underline-offset-4"><LinkIcon size={24} />Deployment URL: {deploymentUrl ? `https://arweave.net/${deploymentUrl}` : "Loading..."}</Link>
        <Link href={`https://${antName}.arweave.net`} target="_blank" className="w-fit flex items-center gap-1 my-2 hover:underline underline-offset-4"><LinkIcon size={24} />ArNS : {(antName || "[fetching]") + ".arweave.net"}</Link>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-start">
            <Card>
                <div className="text-muted-foreground mb-2">Build Output</div>
                <pre className="overflow-scroll max-h-[350px] font-mono" id="logs">
                    <div className="font-mono">
                        <Ansi log={buildOutput} />
                    </div>
                </pre>
            </Card>
            <div className="grid grid-cols-1 gap-2">
                <Card className=" h-fit p-0">
                    <div className="text-muted-foreground">Install Command</div>
                    {deployment.InstallCMD}</Card>
                <Card className=" h-fit p-0">
                    <div className="text-muted-foreground">Build Command</div>
                    {deployment.BuildCMD}</Card>
                <Card className=" h-fit p-0">
                    <div className="text-muted-foreground">
                        Active Branch
                    </div>
                    {deployment.Branch}</Card>
                <Card className=" h-fit p-0">
                    <div className="text-muted-foreground">Output Directory</div>
                    {deployment.OutputDIR}</Card>
                <Button variant="destructive" disabled={redeploying} onClick={deleteDeployment}>Delete Deployment</Button>
            </div>
        </div>
    </Layout>;
}
